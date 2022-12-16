extern crate console_error_panic_hook;

use smoldot::json_rpc::methods::{HashHexString, HexString};
use std::collections::BTreeMap;
use wasm_bindgen::prelude::*;

mod bindings;
mod proof;
mod task;

#[wasm_bindgen]
pub async fn get_metadata(code: JsValue) -> Result<JsValue, JsError> {
    std::panic::set_hook(Box::new(console_error_panic_hook::hook));
    _ = console_log::init_with_level(log::Level::Debug);

    let code = serde_wasm_bindgen::from_value::<HexString>(code)?;
    let metadata = task::get_metadata(code)
        .await
        .map_err(|e| JsError::new(e.as_str()))?;
    let result = serde_wasm_bindgen::to_value(&metadata)?;

    Ok(result)
}

#[wasm_bindgen]
pub async fn get_runtime_version(code: JsValue) -> Result<JsValue, JsError> {
    std::panic::set_hook(Box::new(console_error_panic_hook::hook));
    _ = console_log::init_with_level(log::Level::Debug);

    let code = serde_wasm_bindgen::from_value::<HexString>(code)?;
    let runtime_version = task::runtime_version(code)
        .await
        .map_err(|e| JsError::new(e.as_str()))?;
    let result = serde_wasm_bindgen::to_value(&runtime_version)?;

    Ok(result)
}

#[wasm_bindgen]
pub async fn calculate_state_root(entries: JsValue) -> Result<JsValue, JsError> {
    std::panic::set_hook(Box::new(console_error_panic_hook::hook));
    _ = console_log::init_with_level(log::Level::Debug);

    let entries = serde_wasm_bindgen::from_value::<Vec<(HexString, HexString)>>(entries)?;
    let hash = task::calculate_state_root(entries);
    let result = serde_wasm_bindgen::to_value(&hash)?;

    Ok(result)
}

#[wasm_bindgen]
pub async fn decode_proof(
    root_trie_hash: JsValue,
    keys: JsValue,
    nodes: JsValue,
) -> Result<JsValue, JsError> {
    std::panic::set_hook(Box::new(console_error_panic_hook::hook));
    _ = console_log::init_with_level(log::Level::Debug);

    let root_trie_hash = serde_wasm_bindgen::from_value::<HashHexString>(root_trie_hash)?;
    let keys = serde_wasm_bindgen::from_value::<Vec<HexString>>(keys)?;
    let nodes = serde_wasm_bindgen::from_value::<HexString>(nodes)?;
    let entries =
        proof::decode_proof(root_trie_hash, keys, nodes.0).map_err(|e| JsError::new(e.as_str()))?;
    let result = serde_wasm_bindgen::to_value(&entries)?;

    Ok(result)
}

#[wasm_bindgen]
pub async fn create_proof(
    root_trie_hash: JsValue,
    nodes: JsValue,
    entries: JsValue,
) -> Result<JsValue, JsError> {
    std::panic::set_hook(Box::new(console_error_panic_hook::hook));
    _ = console_log::init_with_level(log::Level::Debug);

    let root_trie_hash = serde_wasm_bindgen::from_value::<HashHexString>(root_trie_hash)?;
    let proof = serde_wasm_bindgen::from_value::<HexString>(nodes)?;
    let entries = serde_wasm_bindgen::from_value::<Vec<(HexString, HexString)>>(entries)?;
    let entries = BTreeMap::from_iter(entries.into_iter().map(|(key, value)| (key.0, value.0)));
    let proof = proof::create_proof(root_trie_hash, proof.0, entries)
        .map_err(|e| JsError::new(e.as_str()))?;
    let result = serde_wasm_bindgen::to_value(&proof)?;

    Ok(result)
}

#[wasm_bindgen]
pub async fn run_task(task: JsValue) -> Result<JsValue, JsError> {
    std::panic::set_hook(Box::new(console_error_panic_hook::hook));
    _ = console_log::init_with_level(log::Level::Debug);

    let task = serde_wasm_bindgen::from_value::<task::TaskCall>(task)?;
    let result = task::run_task(task).await.map_err(|e| JsError::new(e.as_str()))?;
    let result = serde_wasm_bindgen::to_value(&result)?;

    Ok(result)
}
