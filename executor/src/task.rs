use core::{iter, ops::Bound};
use hashbrown::HashMap;
use serde::{Deserialize, Serialize};
use smoldot::{
    executor::{
        host::{Config, HeapPages, HostVmPrototype},
        offchain_runtime_host::{self, OffchainRuntimeHostVm},
        runtime_host::{self, RuntimeHostVm},
        storage_diff::TrieDiff,
        CoreVersionRef,
    },
    json_rpc::methods::HexString,
    trie::{
        bytes_to_nibbles,
        calculate_root::{root_merkle_value, RootMerkleValueCalculation},
        nibbles_to_bytes_suffix_extend, TrieEntryVersion,
    },
};
use std::collections::BTreeMap;

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeVersion {
    pub spec_name: HexString,
    pub impl_name: HexString,
    pub authoring_version: u32,
    pub spec_version: u32,
    pub impl_version: u32,
    pub apis: Vec<(HexString, u32)>,
    pub transaction_version: u32,
    pub state_version: u8,
}

impl RuntimeVersion {
    fn new(core_version_ref: CoreVersionRef) -> Self {
        let CoreVersionRef {
            spec_name,
            impl_name,
            authoring_version,
            spec_version,
            impl_version,
            apis,
            transaction_version,
            state_version,
        } = core_version_ref;
        RuntimeVersion {
            spec_name: HexString(spec_name.as_bytes().to_vec()),
            impl_name: HexString(impl_name.as_bytes().to_vec()),
            authoring_version,
            spec_version,
            impl_version,
            apis: apis
                .into_iter()
                .map(|x| (HexString(x.name_hash.to_vec()), x.version))
                .collect(),
            transaction_version: transaction_version.unwrap_or_default(),
            state_version: state_version.unwrap_or(TrieEntryVersion::V0).into(),
        }
    }
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct TaskCall {
    wasm: HexString,
    calls: Vec<(String, Vec<HexString>)>,
    storage: Vec<(HexString, Option<HexString>)>,
    mock_signature_host: bool,
    allow_unresolved_imports: bool,
    runtime_log_level: u32,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CallResponse {
    result: HexString,
    storage_diff: Vec<(HexString, Option<HexString>)>,
    offchain_storage_diff: Vec<(HexString, Option<HexString>)>,
    runtime_logs: Vec<String>,
}

#[derive(Serialize, Deserialize, Debug)]
pub enum TaskResponse {
    Call(CallResponse),
    Error(String),
}

// starts with 0xdeadbeef and then rest filled by 0xcd
fn is_magic_signature(signature: &[u8]) -> bool {
    signature.starts_with(&[0xde, 0xad, 0xbe, 0xef]) && signature[4..].iter().all(|&b| b == 0xcd)
}

pub async fn run_task(task: TaskCall, js: crate::JsCallback) -> Result<TaskResponse, String> {
    let mut storage_main_trie_changes = TrieDiff::from_iter(
        task.storage
            .into_iter()
            .map(|(key, value)| (key.0, value.map(|x| x.0), ())),
    );
    let mut offchain_storage_changes = HashMap::default();

    let vm_proto = HostVmPrototype::new(Config {
        module: &task.wasm,
        heap_pages: HeapPages::from(2048),
        exec_hint: smoldot::executor::vm::ExecHint::Oneshot,
        allow_unresolved_imports: task.allow_unresolved_imports,
    })
    .unwrap();
    let mut ret: Result<Vec<u8>, String> = Ok(Vec::new());
    let mut runtime_logs: Vec<String> = vec![];

    for (call, params) in task.calls {
        let mut vm = runtime_host::run(runtime_host::Config {
            virtual_machine: vm_proto.clone(),
            function_to_call: call.as_str(),
            parameter: params.into_iter().map(|x| x.0),
            storage_main_trie_changes,
            offchain_storage_changes,
            max_log_level: task.runtime_log_level,
        })
        .unwrap();

        log::trace!("Calling {}", call);

        let res = loop {
            vm = match vm {
                RuntimeHostVm::Finished(res) => {
                    break res;
                }
                RuntimeHostVm::StorageGet(req) => {
                    let key = HexString(req.key().as_ref().to_vec());
                    let key = serde_wasm_bindgen::to_value(&key).map_err(|e| e.to_string())?;
                    let value = js.get_storage(key).await;
                    let value = if value.is_string() {
                        let encoded = serde_wasm_bindgen::from_value::<HexString>(value)
                            .map(|x| x.0)
                            .map_err(|e| e.to_string())?;
                        Some(encoded)
                    } else {
                        None
                    };
                    req.inject_value(value.map(|x| (iter::once(x), TrieEntryVersion::V1)))
                }
                RuntimeHostVm::ClosestDescendantMerkleValue(req) => {
                    let value = js.get_state_root().await;
                    let value = serde_wasm_bindgen::from_value::<HexString>(value)
                        .map(|x| x.0)
                        .map_err(|e| e.to_string())?;
                    req.inject_merkle_value(Some(value.as_ref()))
                }
                RuntimeHostVm::NextKey(req) => {
                    if req.branch_nodes() {
                        // root_calculation, skip
                        req.inject_key(None::<Vec<_>>.map(|x| x.into_iter()))
                    } else {
                        let prefix = HexString(
                            nibbles_to_bytes_suffix_extend(req.prefix()).collect::<Vec<_>>(),
                        );
                        let key = HexString(
                            nibbles_to_bytes_suffix_extend(req.key()).collect::<Vec<_>>(),
                        );
                        let prefix =
                            serde_wasm_bindgen::to_value(&prefix).map_err(|e| e.to_string())?;
                        let key = serde_wasm_bindgen::to_value(&key).map_err(|e| e.to_string())?;
                        let value = js.get_next_key(prefix, key).await;
                        let value = if value.is_string() {
                            serde_wasm_bindgen::from_value::<HexString>(value)
                                .map(|x| Some(x.0))
                                .map_err(|e| e.to_string())?
                        } else {
                            None
                        };
                        req.inject_key(value.map(|x| bytes_to_nibbles(x.into_iter())))
                    }
                }
                RuntimeHostVm::SignatureVerification(req) => {
                    let bypass =
                        task.mock_signature_host && is_magic_signature(req.signature().as_ref());
                    if bypass {
                        req.resume_success()
                    } else {
                        req.verify_and_resume()
                    }
                }
            }
        };

        log::trace!("Completed {}", call);

        match res {
            Ok(success) => {
                ret = Ok(success.virtual_machine.value().as_ref().to_vec());

                storage_main_trie_changes = success.storage_changes.into_main_trie_diff();
                offchain_storage_changes = success.offchain_storage_changes;

                if !success.logs.is_empty() {
                    runtime_logs.push(success.logs);
                }
            }
            Err(err) => {
                ret = Err(err.to_string());
                storage_main_trie_changes = TrieDiff::empty();
                offchain_storage_changes = HashMap::default();
                break;
            }
        }
    }

    Ok(ret.map_or_else(TaskResponse::Error, move |ret| {
        let diff = storage_main_trie_changes
            .diff_into_iter_unordered()
            .map(|(k, v, _)| (HexString(k), v.map(HexString)))
            .collect();

        let offchain_diff = offchain_storage_changes
            .into_iter()
            .map(|(k, v)| (HexString(k), v.map(HexString)))
            .collect();

        TaskResponse::Call(CallResponse {
            result: HexString(ret),
            storage_diff: diff,
            offchain_storage_diff: offchain_diff,
            runtime_logs,
        })
    }))
}

pub async fn run_offchain(
    wasm: &Vec<u8>,
    parameter: &Vec<Vec<u8>>,
    js: crate::JsCallback,
) -> Result<TaskResponse, String> {
    let vm_proto = HostVmPrototype::new(Config {
        module: &wasm,
        heap_pages: HeapPages::from(2048),
        exec_hint: smoldot::executor::vm::ExecHint::Oneshot,
        allow_unresolved_imports: false,
    })
    .map_err(|err| err.to_string())?;

    let mut vm = offchain_runtime_host::run(offchain_runtime_host::Config {
        virtual_machine: vm_proto.clone(),
        function_to_call: "OffchainWorkerApi_offchain_worker",
        parameter: parameter.into_iter(),
        offchain_storage_changes: HashMap::default(),
        max_log_level: 5,
    })
    .map_err(|(err, _)| err.to_string())?;

    let res = loop {
        vm = match vm {
            OffchainRuntimeHostVm::Finished(res) => {
                break res;
            }
            OffchainRuntimeHostVm::StorageGet(req) => {
                let key = HexString(req.key().as_ref().to_vec());
                let key = serde_wasm_bindgen::to_value(&key).map_err(|e| e.to_string())?;
                let value = js.get_storage(key).await;
                let value = if value.is_string() {
                    let encoded = serde_wasm_bindgen::from_value::<HexString>(value)
                        .map(|x| x.0)
                        .map_err(|e| e.to_string())?;
                    Some(encoded)
                } else {
                    None
                };
                req.inject_value(value)
            }
            OffchainRuntimeHostVm::NextKey(req) => {
                let prefix = HexString(req.prefix().as_ref().to_vec());
                let key = HexString(req.key().as_ref().to_vec());
                let prefix = serde_wasm_bindgen::to_value(&prefix).map_err(|e| e.to_string())?;
                let key = serde_wasm_bindgen::to_value(&key).map_err(|e| e.to_string())?;
                let value = js.get_next_key(prefix, key).await;
                let value = if value.is_string() {
                    serde_wasm_bindgen::from_value::<HexString>(value)
                        .map(|x| Some(x.0))
                        .map_err(|e| e.to_string())?
                } else {
                    None
                };
                req.inject_key(value)
            }
            OffchainRuntimeHostVm::OffchainStorageGet(req) => {
                let key = HexString(req.key().as_ref().to_vec());
                let key = serde_wasm_bindgen::to_value(&key).map_err(|e| e.to_string())?;
                let value = js.offchain_get_storage(key).await;
                let value = if value.is_string() {
                    let encoded = serde_wasm_bindgen::from_value::<HexString>(value)
                        .map(|x| x.0)
                        .map_err(|e| e.to_string())?;
                    Some(encoded)
                } else {
                    None
                };
                req.inject_value(value)
            }
            OffchainRuntimeHostVm::OffchainTimestamp(req) => {
                let value = js.offchain_timestamp().await;
                let timestamp =
                    serde_wasm_bindgen::from_value::<u64>(value).map_err(|e| e.to_string())?;
                req.inject_timestamp(timestamp)
            }
            OffchainRuntimeHostVm::OffchainRandomSeed(req) => {
                let value = js.offchain_random_seed().await;
                let random = serde_wasm_bindgen::from_value::<HexString>(value)
                    .map_err(|e| e.to_string())?;
                let value: [u8; 32] = random
                    .0
                    .try_into()
                    .map_err(|_| "invalid random seed value")?;
                req.inject_random_seed(value)
            }
            OffchainRuntimeHostVm::OffchainSubmitTransaction(req) => {
                let tx =
                    serde_wasm_bindgen::to_value(&HexString(req.transaction().as_ref().to_vec()))
                        .map_err(|e| e.to_string())?;
                let outcome = js.offchain_submit_transaction(tx).await;
                let hash = serde_wasm_bindgen::from_value::<HexString>(outcome)
                    .map_err(|e| e.to_string())?;
                req.inject_outcome(hash.0)
            }
        }
    };

    match res {
        Ok(success) => {
            let offchain_diff = success
                .offchain_storage_changes
                .into_iter()
                .map(|(k, v)| (HexString(k), v.map(HexString)))
                .collect();

            Ok(TaskResponse::Call(CallResponse {
                result: HexString(success.virtual_machine.value().as_ref().to_vec()),
                storage_diff: Default::default(),
                offchain_storage_diff: offchain_diff,
                runtime_logs: vec![success.logs],
            }))
        }
        Err(err) => Ok(TaskResponse::Error(format!("{:?}", err))),
    }
}

pub async fn runtime_version(wasm: HexString) -> Result<RuntimeVersion, String> {
    let vm_proto = HostVmPrototype::new(Config {
        module: &wasm,
        heap_pages: HeapPages::from(2048),
        exec_hint: smoldot::executor::vm::ExecHint::Oneshot,
        allow_unresolved_imports: true,
    })
    .unwrap();

    let core_version = vm_proto.runtime_version().decode();

    Ok(RuntimeVersion::new(core_version))
}

pub fn calculate_state_root(
    entries: Vec<(HexString, HexString)>,
    trie_version: TrieEntryVersion,
) -> HexString {
    let mut calc = root_merkle_value();
    let map = entries
        .into_iter()
        .map(|(k, v)| (k.0, v.0))
        .collect::<BTreeMap<Vec<u8>, Vec<u8>>>();
    loop {
        match calc {
            RootMerkleValueCalculation::Finished { hash, .. } => {
                return HexString(hash.to_vec());
            }
            RootMerkleValueCalculation::NextKey(next_key) => {
                let lower_bound = if next_key.or_equal() {
                    Bound::Included(next_key.key_before().collect::<Vec<_>>())
                } else {
                    Bound::Excluded(next_key.key_before().collect::<Vec<_>>())
                };

                let k = map
                    .range((lower_bound, Bound::Unbounded))
                    .next()
                    .filter(|(k, _)| {
                        k.iter()
                            .copied()
                            .zip(next_key.prefix())
                            .all(|(a, b)| a == b)
                    })
                    .map(|(k, _)| k);

                calc = next_key.inject_key(k.map(|k| k.iter().copied()));
            }
            RootMerkleValueCalculation::StorageValue(req) => {
                let key = req.key().collect::<Vec<u8>>();
                calc = req.inject(map.get(&key).map(|x| (x, trie_version)));
            }
        }
    }
}

#[test]
fn is_magic_signature_works() {
    assert!(is_magic_signature(&[0xde, 0xad, 0xbe, 0xef, 0xcd, 0xcd]));
    assert!(is_magic_signature(&[
        0xde, 0xad, 0xbe, 0xef, 0xcd, 0xcd, 0xcd, 0xcd
    ]));
    assert!(!is_magic_signature(&[
        0xde, 0xad, 0xbe, 0xef, 0xcd, 0xcd, 0xcd, 0x00
    ]));
    assert!(!is_magic_signature(&[
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
    ]));
}
