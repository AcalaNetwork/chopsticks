use core::iter;
use runner_api::RpcApiClient;
use smoldot::{
    executor::{
        host::{Config, HeapPages, HostVmPrototype},
        runtime_host::{self, RuntimeHostVm},
        storage_diff,
    },
    json_rpc::methods::HexString,
};

mod runner_api;

#[derive(Debug, Clone, clap::Parser)]
pub struct Command {
    #[clap(long, default_value = "ws://localhost:8000")]
    runner_url: String,
}

#[tokio::main]
async fn main() -> Result<(), jsonrpsee::core::Error> {
    let config = <Command as clap::Parser>::parse();

	println!("Starting...");

    let client = runner_api::client(&config.runner_url).await?;

    let task = client.get_task().await?;
    let block_hash = task.block_hash;

    let mut vm = runtime_host::run(runtime_host::Config {
        virtual_machine: HostVmPrototype::new(Config {
            module: &task.wasm,
            heap_pages: HeapPages::from(2048),
            exec_hint: smoldot::executor::vm::ExecHint::Oneshot,
            allow_unresolved_imports: false,
        })
        .unwrap(),
        function_to_call: &task.call,
        parameter: iter::once(task.params.as_ref()),
        top_trie_root_calculation_cache: None,
        storage_top_trie_changes: storage_diff::StorageDiff::empty(),
        offchain_storage_changes: storage_diff::StorageDiff::empty(),
    })
    .unwrap();

    let res = loop {
        vm = match vm {
            RuntimeHostVm::Finished(res) => {
                break res;
            }
            RuntimeHostVm::StorageGet(req) => {
                let key = req.key_as_vec();
                let mut value = client.storage_get(&block_hash, HexString(key)).await?;
                if let Some(val) = &value {
                    if val.0.is_empty() {
                        value = None;
                    }
                }
                req.inject_value(value.map(|v| iter::once(v.0)))
            }
            RuntimeHostVm::PrefixKeys(req) => {
                let prefix = req.prefix().as_ref().to_vec();
				if prefix.is_empty() {
					req.inject_keys_ordered(iter::empty::<Vec<u8>>())
				} else {
					let keys = client.prefix_keys(&block_hash, HexString(prefix)).await?;
                	req.inject_keys_ordered(keys.into_iter().map(|v| v.0))
				}
            }
            RuntimeHostVm::NextKey(req) => {
                let key = req.key().as_ref().to_vec();
                let next_key = client.next_key(&block_hash, HexString(key)).await?;
                req.inject_key(next_key.map(|k| k.0))
            }
        }
    };

	println!("Result: {:?}", res);

    Ok(())
}
