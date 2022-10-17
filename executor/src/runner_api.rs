use std::time::Duration;

use jsonrpsee::{
    core::Error as RpcError,
    proc_macros::rpc,
    ws_client::{WsClient, WsClientBuilder},
};
use serde::{Deserialize, Serialize};
use smoldot::json_rpc::methods::HexString;

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub wasm: HexString,
    pub call: String,
    pub params: HexString,
    pub block_hash: HexString,
}

#[rpc(client)]
pub trait RpcApi {
    #[method(name = "exec_storageGet")]
    fn storage_get(
        &self,
        block_hash: &HexString,
        key: HexString,
    ) -> Result<Option<HexString>, RpcError>;

    #[method(name = "exec_prefixKeys")]
    fn prefix_keys(
        &self,
        block_hash: &HexString,
        key: HexString,
    ) -> Result<Vec<HexString>, RpcError>;

    #[method(name = "exec_nextKey")]
    fn next_key(
        &self,
        block_hash: &HexString,
        key: HexString,
    ) -> Result<Option<HexString>, RpcError>;

    #[method(name = "exec_getTask")]
    fn get_task(&self) -> Result<Task, RpcError>;
}

pub async fn client(url: &str) -> Result<WsClient, RpcError> {
    let client = WsClientBuilder::default()
        .request_timeout(Duration::from_secs(120))
        .build(url)
        .await?;
    Ok(client)
}
