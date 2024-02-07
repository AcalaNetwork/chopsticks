use core::{iter, ops::Bound};
use serde::{Deserialize, Serialize};
use serde_wasm_bindgen::{from_value, to_value};
use smoldot::{
    executor::{
        host::{Config, HeapPages, HostVmPrototype, LogEmitInfo},
        runtime_call::{self, OffchainContext, RuntimeCall},
        storage_diff::TrieDiff,
        CoreVersionRef,
    },
    json_rpc::methods::HexString,
    trie::{
        bytes_to_nibbles,
        calculate_root::{root_merkle_value, RootMerkleValueCalculation},
        nibbles_to_bytes_suffix_extend, HashFunction, TrieEntryVersion,
    },
};
use std::collections::BTreeMap;
use wasm_bindgen::prelude::*;

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
    mock_signature_host: bool,
    allow_unresolved_imports: bool,
    runtime_log_level: u32,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct LogInfo {
    message: String,
    level: Option<u32>,
    target: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CallResponse {
    result: HexString,
    storage_diff: Vec<(HexString, Option<HexString>)>,
    offchain_storage_diff: Vec<(HexString, Option<HexString>)>,
    runtime_logs: Vec<LogInfo>,
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

const DEFAULT_CHILD_STORAGE_PREFIX: &[u8] = b":child_storage:default:";

fn prefixed_child_key(child: impl Iterator<Item = u8>, key: impl Iterator<Item = u8>) -> Vec<u8> {
    [
        DEFAULT_CHILD_STORAGE_PREFIX,
        &child.collect::<Vec<_>>(),
        &key.collect::<Vec<_>>(),
    ]
    .concat()
}

fn handle_value(value: wasm_bindgen::JsValue) -> Result<Option<Vec<u8>>, JsError> {
    if value.is_string() {
        let encoded = from_value::<HexString>(value).map(|x| x.0)?;
        Ok(Some(encoded))
    } else {
        Ok(None)
    }
}

pub async fn run_task(task: TaskCall, js: crate::JsCallback) -> Result<TaskResponse, JsValue> {
    let mut storage_main_trie_changes = TrieDiff::default();
    let mut storage_changes: BTreeMap<Vec<u8>, Option<Vec<u8>>> = Default::default();
    let mut offchain_storage_changes: BTreeMap<Vec<u8>, Option<Vec<u8>>> = Default::default();

    let vm_proto = HostVmPrototype::new(Config {
        module: &task.wasm,
        heap_pages: HeapPages::from(2048),
        exec_hint: smoldot::executor::vm::ExecHint::ValidateAndExecuteOnce,
        allow_unresolved_imports: task.allow_unresolved_imports,
    })
    .unwrap();
    let mut ret: Result<Vec<u8>, String> = Ok(Vec::new());
    let mut runtime_logs: Vec<LogInfo> = vec![];

    for (call, params) in task.calls {
        let mut vm = runtime_call::run(runtime_call::Config {
            virtual_machine: vm_proto.clone(),
            function_to_call: call.as_str(),
            parameter: params.into_iter().map(|x| x.0),
            storage_main_trie_changes,
            max_log_level: task.runtime_log_level,
            calculate_trie_changes: false,
        })
        .unwrap();

        log::trace!("Calling {}", call);

        let res = loop {
            vm = match vm {
                RuntimeCall::Finished(res) => {
                    break res;
                }

                RuntimeCall::StorageGet(req) => {
                    let key = if let Some(child) = req.child_trie() {
                        HexString(prefixed_child_key(
                            child.as_ref().iter().copied(),
                            req.key().as_ref().iter().copied(),
                        ))
                    } else {
                        HexString(req.key().as_ref().to_vec())
                    };

                    // check storage_changes first
                    if let Some(value) = storage_changes.get(&key.0) {
                        req.inject_value(
                            value
                                .to_owned()
                                .map(|x| (iter::once(x), TrieEntryVersion::V1)),
                        )
                    } else {
                        // otherwise, ask chopsticks
                        let key = to_value(&key)?;

                        let value = js.get_storage(key).await?;
                        let value = if value.is_string() {
                            let encoded = from_value::<HexString>(value).map(|x| x.0)?;
                            Some(encoded)
                        } else {
                            None
                        };
                        req.inject_value(value.map(|x| (iter::once(x), TrieEntryVersion::V1)))
                    }
                }

                RuntimeCall::ClosestDescendantMerkleValue(_req) => {
                    unreachable!()
                }

                RuntimeCall::NextKey(req) => {
                    if req.branch_nodes() {
                        // root_calculation, skip
                        req.inject_key(None::<Vec<_>>.map(|x| x.into_iter()))
                    } else {
                        let prefix = if let Some(child) = req.child_trie() {
                            HexString(prefixed_child_key(
                                child.as_ref().iter().copied(),
                                nibbles_to_bytes_suffix_extend(req.prefix()),
                            ))
                        } else {
                            HexString(
                                nibbles_to_bytes_suffix_extend(req.prefix()).collect::<Vec<_>>(),
                            )
                        };
                        let key = if let Some(child) = req.child_trie() {
                            HexString(prefixed_child_key(
                                child.as_ref().iter().copied(),
                                nibbles_to_bytes_suffix_extend(req.key()),
                            ))
                        } else {
                            HexString(nibbles_to_bytes_suffix_extend(req.key()).collect::<Vec<_>>())
                        };
                        let prefix = to_value(&prefix)?;
                        let key = to_value(&key)?;
                        let value = js.get_next_key(prefix, key).await?;
                        req.inject_key(
                            handle_value(value)?.map(|x| bytes_to_nibbles(x.into_iter())),
                        )
                    }
                }

                RuntimeCall::SignatureVerification(req) => {
                    let bypass =
                        task.mock_signature_host && is_magic_signature(req.signature().as_ref());
                    if bypass {
                        req.resume_success()
                    } else {
                        req.verify_and_resume()
                    }
                }

                RuntimeCall::OffchainStorageSet(req) => {
                    offchain_storage_changes.insert(
                        req.key().as_ref().to_vec(),
                        req.value().map(|x| x.as_ref().to_vec()),
                    );
                    req.resume()
                }

                RuntimeCall::Offchain(ctx) => match ctx {
                    OffchainContext::StorageGet(req) => {
                        let key = HexString(req.key().as_ref().to_vec());
                        let key = to_value(&key)?;
                        let value = js.offchain_get_storage(key).await?;
                        req.inject_value(handle_value(value)?)
                    }

                    OffchainContext::StorageSet(req) => {
                        let key = req.key().as_ref().to_vec();
                        let current_value = offchain_storage_changes.get(&key);

                        let replace = match (current_value, req.old_value()) {
                            (Some(Some(current_value)), Some(old_value)) => {
                                old_value.as_ref().eq(current_value)
                            }
                            _ => true,
                        };

                        if replace {
                            offchain_storage_changes
                                .insert(key, req.value().map(|x| x.as_ref().to_vec()));
                        }

                        req.resume(replace)
                    }

                    OffchainContext::Timestamp(req) => {
                        let value = js.offchain_timestamp().await?;
                        let timestamp = from_value::<u64>(value)?;
                        req.inject_timestamp(timestamp)
                    }

                    OffchainContext::RandomSeed(req) => {
                        let value = js.offchain_random_seed().await?;
                        let random = from_value::<HexString>(value)?;
                        let value: [u8; 32] = random
                            .0
                            .try_into()
                            .map_err(|_| JsError::new("invalid random seed value"))?;
                        req.inject_random_seed(value)
                    }

                    OffchainContext::SubmitTransaction(req) => {
                        let tx = HexString(req.transaction().as_ref().to_vec());
                        let tx = to_value(&tx)?;
                        let success = js.offchain_submit_transaction(tx).await?;
                        let success = from_value::<bool>(success)?;
                        req.resume(success)
                    }
                },

                RuntimeCall::LogEmit(req) => {
                    {
                        match req.info() {
                            LogEmitInfo::Num(v) => {
                                log::info!("{}", v);
                                runtime_logs.push(LogInfo {
                                    message: format!("{}", v),
                                    level: None,
                                    target: None,
                                });
                            }
                            LogEmitInfo::Utf8(v) => {
                                log::info!("{}", v.to_string());
                                runtime_logs.push(LogInfo {
                                    message: v.to_string(),
                                    level: None,
                                    target: None,
                                });
                            }
                            LogEmitInfo::Hex(v) => {
                                log::info!("{}", v.to_string());
                                runtime_logs.push(LogInfo {
                                    message: v.to_string(),
                                    level: None,
                                    target: None,
                                });
                            }
                            LogEmitInfo::Log {
                                log_level,
                                target,
                                message,
                            } => {
                                let level = match log_level {
                                    0 => "ERROR".to_string(),
                                    1 => "WARN".to_string(),
                                    2 => "INFO".to_string(),
                                    3 => "DEBUG".to_string(),
                                    4 => "TRACE".to_string(),
                                    l => format!("_{l}_"),
                                };
                                log::info!(
                                    "{}: {}",
                                    format!("{:<28}{:>6}", target.to_string(), level),
                                    message.to_string()
                                );
                                runtime_logs.push(LogInfo {
                                    message: message.to_string(),
                                    level: Some(log_level),
                                    target: Some(target.to_string()),
                                });
                            }
                        };
                    }
                    req.resume()
                }
            }
        };

        log::trace!("Completed {}", call);

        match res {
            Ok(success) => {
                ret = Ok(success.virtual_machine.value().as_ref().to_vec());

                success
                    .storage_changes
                    .storage_changes_iter_unordered()
                    .for_each(|(child, key, value)| {
                        let prefixed_key = if let Some(child) = child {
                            prefixed_child_key(child.iter().copied(), key.iter().copied())
                        } else {
                            key.to_vec()
                        };
                        storage_changes.insert(prefixed_key, value.map(|x| x.to_vec()));
                    });

                storage_main_trie_changes = success.storage_changes.into_main_trie_diff();
            }
            Err(err) => {
                ret = Err(err.to_string());
                break;
            }
        }
    }

    Ok(ret.map_or_else(TaskResponse::Error, move |ret| {
        let storage_diff = storage_changes
            .into_iter()
            .map(|(k, v)| (HexString(k), v.map(HexString)))
            .collect();

        let offchain_storage_diff = offchain_storage_changes
            .into_iter()
            .map(|(k, v)| (HexString(k), v.map(HexString)))
            .collect();

        TaskResponse::Call(CallResponse {
            result: HexString(ret),
            storage_diff,
            offchain_storage_diff,
            runtime_logs,
        })
    }))
}

pub async fn runtime_version(wasm: HexString) -> RuntimeVersion {
    let vm_proto = HostVmPrototype::new(Config {
        module: &wasm,
        heap_pages: HeapPages::from(2048),
        exec_hint: smoldot::executor::vm::ExecHint::ValidateAndExecuteOnce,
        allow_unresolved_imports: true,
    })
    .unwrap();

    let core_version = vm_proto.runtime_version().decode();

    RuntimeVersion::new(core_version)
}

pub fn calculate_state_root(
    entries: Vec<(HexString, HexString)>,
    trie_version: TrieEntryVersion,
) -> HexString {
    let mut calc = root_merkle_value(HashFunction::Blake2);
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
