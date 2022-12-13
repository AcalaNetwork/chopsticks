extern crate console_error_panic_hook;

use futures::prelude::*;
use jsonrpsee::core::client::Client;
use std::collections::BTreeMap;
use wasm_bindgen::prelude::*;

mod proof;
mod runner_api;
mod task;
use crate::runner_api::RpcApiClient;
use smoldot::json_rpc::methods::{HashHexString, HexString};

#[wasm_bindgen]
pub async fn get_metadata(code: &str) -> Result<JsValue, JsValue> {
    std::panic::set_hook(Box::new(console_error_panic_hook::hook));
    // _ = console_log::init_with_level(log::Level::Debug);

    let code = HexString(hex::decode(&code[2..]).map_err(|e| e.to_string())?);
    let metadata = task::Task::get_metadata(code)
        .await
        .map_err(|e| e.to_string())?;

    Ok(metadata.to_string().into())
}

#[wasm_bindgen]
pub async fn get_runtime_version(code: &str) -> Result<JsValue, JsValue> {
    std::panic::set_hook(Box::new(console_error_panic_hook::hook));
    // _ = console_log::init_with_level(log::Level::Debug);

    let code = HexString(hex::decode(&code[2..]).map_err(|e| e.to_string())?);
    let runtime_version = task::Task::runtime_version(code)
        .await
        .map_err(|e| e.to_string())?;

    let result = serde_wasm_bindgen::to_value(&runtime_version)?;
    Ok(result)
}

#[wasm_bindgen]
pub async fn calculate_state_root(entries: JsValue) -> Result<JsValue, JsValue> {
    std::panic::set_hook(Box::new(console_error_panic_hook::hook));
    // _ = console_log::init_with_level(log::Level::Debug);

    let entries = serde_wasm_bindgen::from_value::<Vec<(HexString, HexString)>>(entries)?;
    let hash = task::Task::calculate_state_root(entries);

    Ok(hash.to_string().into())
}

#[wasm_bindgen]
pub async fn decode_proof(
    root_trie_hash: JsValue,
    keys: JsValue,
    nodes: JsValue,
) -> Result<JsValue, JsValue> {
    std::panic::set_hook(Box::new(console_error_panic_hook::hook));
    // _ = console_log::init_with_level(log::Level::Debug);
    let root_trie_hash = serde_wasm_bindgen::from_value::<HashHexString>(root_trie_hash)?;
    let keys = serde_wasm_bindgen::from_value::<Vec<HexString>>(keys)?;
    let nodes = serde_wasm_bindgen::from_value::<HexString>(nodes)?;
    let entries = proof::decode_proof(root_trie_hash, keys, nodes.0).map_err(|e| e.to_string())?;
    let result = serde_wasm_bindgen::to_value(&entries)?;
    Ok(result)
}

#[wasm_bindgen]
pub async fn create_proof(
    root_trie_hash: JsValue,
    nodes: JsValue,
    entries: JsValue,
) -> Result<JsValue, JsValue> {
    std::panic::set_hook(Box::new(console_error_panic_hook::hook));
    // _ = console_log::init_with_level(log::Level::Debug);
    let root_trie_hash = serde_wasm_bindgen::from_value::<HashHexString>(root_trie_hash)?;
    let proof = serde_wasm_bindgen::from_value::<HexString>(nodes)?;
    let entries = serde_wasm_bindgen::from_value::<Vec<(HexString, HexString)>>(entries)?;
    let entries = BTreeMap::from_iter(entries.into_iter().map(|(key, value)| (key.0, value.0)));
    let proof = proof::create_proof(root_trie_hash, proof.0, entries).map_err(|e| e.to_string())?;
    let result = serde_wasm_bindgen::to_value(&proof)?;
    Ok(result)
}

#[wasm_bindgen]
pub async fn run_task(task_id: u32, ws_url: &str) -> Result<(), JsValue> {
    std::panic::set_hook(Box::new(console_error_panic_hook::hook));
    // _ = console_log::init_with_level(log::Level::Debug);

    let client = runner_api::client(ws_url)
        .await
        .map_err(|e| e.to_string())?;

    do_run_task(&client, task_id)
        .map_err(|e| e.to_string())
        .await?;

    Closure::once(move || drop(client)).forget();

    Ok(())
}

async fn do_run_task(client: &Client, task_id: u32) -> Result<(), jsonrpsee::core::Error> {
    let task = client.get_task(task_id).await?;
    task.run(task_id, client).await?;
    Ok(())
}
