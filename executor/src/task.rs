use core::iter;
use serde::{Deserialize, Serialize};
use smoldot::{
    executor::{
        host::{Config, HeapPages, HostVmPrototype},
        runtime_host::{self, RuntimeHostVm},
        storage_diff::StorageDiff,
        CoreVersionRef,
    },
    json_rpc::methods::HexString,
    trie::{
        calculate_root::{root_merkle_value, RootMerkleValueCalculation},
        TrieEntryVersion,
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
    let mut storage_top_trie_changes = StorageDiff::from_iter(
        task.storage
            .into_iter()
            .map(|(key, value)| (key.0, value.map(|x| x.0), ())),
    );
    let mut offchain_storage_changes = StorageDiff::empty();

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
            top_trie_root_calculation_cache: None,
            storage_top_trie_changes,
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
                    // TODO: not sure if we need to inject correct trie_version because it's ignored
                    // https://github.com/smol-dot/smoldot/blob/82252ea371943bdb1c2caeea5cd1d48494b99660/lib/src/executor/runtime_host.rs#L269
                    req.inject_value(value.map(|x| (iter::once(x), TrieEntryVersion::V1)))
                }
                RuntimeHostVm::PrefixKeys(req) => {
                    let prefix = req.prefix().as_ref().to_vec();
                    if prefix.is_empty() {
                        // this must be coming from `ExternalStorageRoot` trying to get all keys in order to calculate storage root digest
                        // we are not going to fetch all the storages for that, so a dummy value is returned
                        // this means the storage root digest will be wrong, and failed the final check
                        // so we should just avoid doing final check by not supporting execute_block
                        req.inject_keys_ordered(iter::empty::<Vec<u8>>())
                    } else {
                        let key = serde_wasm_bindgen::to_value(&HexString(prefix))
                            .map_err(|e| e.to_string())?;
                        let keys = js.get_prefix_keys(key).await;
                        let keys = serde_wasm_bindgen::from_value::<Vec<HexString>>(keys)
                            .map(|x| x.into_iter().map(|x| x.0))
                            .map_err(|e| e.to_string())?;
                        req.inject_keys_ordered(keys)
                    }
                }
                RuntimeHostVm::NextKey(req) => {
                    let key = HexString(req.key().as_ref().to_vec());
                    let key = serde_wasm_bindgen::to_value(&key).map_err(|e| e.to_string())?;
                    let value = js.get_next_key(key).await;
                    let value = if value.is_string() {
                        serde_wasm_bindgen::from_value::<HexString>(value)
                            .map(|x| Some(x.0))
                            .map_err(|e| e.to_string())?
                    } else {
                        None
                    };
                    req.inject_key(value)
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

                storage_top_trie_changes = success.storage_top_trie_changes;
                offchain_storage_changes = success.offchain_storage_changes;

                if !success.logs.is_empty() {
                    runtime_logs.push(success.logs);
                }
            }
            Err(err) => {
                ret = Err(err.to_string());
                storage_top_trie_changes = StorageDiff::empty();
                break;
            }
        }
    }

    Ok(ret.map_or_else(TaskResponse::Error, move |ret| {
        let diff = storage_top_trie_changes
            .diff_into_iter_unordered()
            .map(|(k, v, _)| (HexString(k), v.map(HexString)))
            .collect();

        TaskResponse::Call(CallResponse {
            result: HexString(ret),
            storage_diff: diff,
            runtime_logs,
        })
    }))
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

pub fn calculate_state_root(entries: Vec<(HexString, HexString)>) -> HexString {
    let mut calc = root_merkle_value(None);
    let map = entries
        .into_iter()
        .map(|(k, v)| (k.0, v.0))
        .collect::<BTreeMap<Vec<u8>, Vec<u8>>>();
    loop {
        match calc {
            RootMerkleValueCalculation::Finished { hash, .. } => {
                return HexString(hash.to_vec());
            }
            RootMerkleValueCalculation::AllKeys(req) => {
                calc = req.inject(map.keys().map(|k| k.iter().cloned()));
            }
            RootMerkleValueCalculation::StorageValue(req) => {
                let key = req.key().collect::<Vec<u8>>();
                // TODO: not sure if we need to inject correct trie_version because it's ignored
                // https://github.com/smol-dot/smoldot/blob/82252ea371943bdb1c2caeea5cd1d48494b99660/lib/src/executor/runtime_host.rs#L269
                calc = req.inject(map.get(&key).map(|x| (x, TrieEntryVersion::V1)));
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
