extern crate console_error_panic_hook;

use futures::prelude::*;
use jsonrpsee::core::client::Client;
use wasm_bindgen::prelude::*;

mod runner_api;
mod task;
use crate::runner_api::RpcApiClient;
use smoldot::json_rpc::methods::HexString;

#[wasm_bindgen]
pub async fn get_metadata(code: &str) -> Result<JsValue, JsValue> {
    std::panic::set_hook(Box::new(console_error_panic_hook::hook));
    _ = console_log::init_with_level(log::Level::Debug);

    let code = HexString(hex::decode(&code[2..]).map_err(|e| e.to_string())?);
    let metadata = task::Task::get_metadata(code).await.map_err(|e| e.to_string())?;

    Ok(metadata.to_string().into())
}

#[wasm_bindgen]
pub async fn get_runtime_version(code: &str) -> Result<JsValue, JsValue> {
    std::panic::set_hook(Box::new(console_error_panic_hook::hook));
    _ = console_log::init_with_level(log::Level::Debug);

    let code = HexString(hex::decode(&code[2..]).map_err(|e| e.to_string())?);
    let runtime_version = task::Task::runtime_version(code)
        .await
        .map_err(|e| e.to_string())?;

    let result = serde_wasm_bindgen::to_value(&runtime_version)?;
    Ok(result)
}

#[wasm_bindgen]
pub async fn start(task_id: u32, ws_url: &str) -> Result<(), JsValue> {
    std::panic::set_hook(Box::new(console_error_panic_hook::hook));
    _ = console_log::init_with_level(log::Level::Debug);

    let client = runner_api::client(ws_url)
        .await
        .map_err(|e| e.to_string())?;
    run_task(&client, task_id)
        .map_err(|x| x.to_string())
        .await?;

    Closure::once(move || drop(client)).forget();

    Ok(())
}

async fn run_task(client: &Client, task_id: u32) -> Result<(), jsonrpsee::core::Error> {
    let task = client.get_task(task_id).await?;
    task.run(task_id, client).await?;
    Ok(())
}
