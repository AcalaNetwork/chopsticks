extern crate console_error_panic_hook;

use smoldot::{
    json_rpc::methods::{HashHexString, HexString},
    trie::TrieEntryVersion,
};
use std::collections::BTreeMap;
use wasm_bindgen::prelude::*;

mod proof;
mod task;

fn setup_console() {
    std::panic::set_hook(Box::new(console_error_panic_hook::hook));
    #[cfg(feature = "logging")]
    {
        let _ = console_log::init_with_level(log::Level::Trace);
    }
}

#[wasm_bindgen]
extern "C" {
    pub type JsCallback;

    #[wasm_bindgen(structural, method, js_name = "getStorage")]
    pub async fn get_storage(this: &JsCallback, key: JsValue) -> JsValue;

    #[wasm_bindgen(structural, method, js_name = "getPrefixKeys")]
    pub async fn get_prefix_keys(this: &JsCallback, key: JsValue) -> JsValue;

    #[wasm_bindgen(structural, method, js_name = "getNextKey")]
    pub async fn get_next_key(this: &JsCallback, key: JsValue) -> JsValue;

    #[wasm_bindgen(structural, method, js_name = "offchainGetStorage")]
    pub async fn offchain_get_storage(this: &JsCallback, key: JsValue) -> JsValue;

    #[wasm_bindgen(structural, method, js_name = "offchainTimestamp")]
    pub async fn offchain_timestamp(this: &JsCallback) -> JsValue;

    #[wasm_bindgen(structural, method, js_name = "offchainRandomSeed")]
    pub async fn offchain_random_seed(this: &JsCallback) -> JsValue;

    #[wasm_bindgen(structural, method, js_name = "offchainSubmitTransaction")]
    pub async fn offchain_submit_transaction(this: &JsCallback, tx: JsValue) -> JsValue;
}

#[wasm_bindgen]
pub async fn get_runtime_version(code: JsValue) -> Result<JsValue, JsValue> {
    setup_console();

    let code = serde_wasm_bindgen::from_value::<HexString>(code)?;
    let runtime_version = task::runtime_version(code).await?;
    let result = serde_wasm_bindgen::to_value(&runtime_version)?;

    Ok(result)
}

#[wasm_bindgen]
pub async fn calculate_state_root(
    entries: JsValue,
    trie_version: JsValue,
) -> Result<JsValue, JsValue> {
    setup_console();

    let entries = serde_wasm_bindgen::from_value::<Vec<(HexString, HexString)>>(entries)?;
    let trie_version = serde_wasm_bindgen::from_value::<u8>(trie_version)?;
    let trie_version =
        TrieEntryVersion::try_from(trie_version).map_err(|_| "invalid trie version")?;
    let hash = task::calculate_state_root(entries, trie_version);
    let result = serde_wasm_bindgen::to_value(&hash)?;

    Ok(result)
}

#[wasm_bindgen]
pub async fn decode_proof(
    root_trie_hash: JsValue,
    keys: JsValue,
    nodes: JsValue,
) -> Result<JsValue, JsValue> {
    setup_console();

    let root_trie_hash = serde_wasm_bindgen::from_value::<HashHexString>(root_trie_hash)?;
    let keys = serde_wasm_bindgen::from_value::<Vec<HexString>>(keys)?;
    let nodes = serde_wasm_bindgen::from_value::<Vec<HexString>>(nodes)?;
    let entries = proof::decode_proof(
        root_trie_hash,
        keys,
        nodes.into_iter().map(|x| x.0).collect(),
    )?;
    let result = serde_wasm_bindgen::to_value(&entries)?;

    Ok(result)
}

#[wasm_bindgen]
pub async fn create_proof(
    root_trie_hash: JsValue,
    nodes: JsValue,
    entries: JsValue,
) -> Result<JsValue, JsValue> {
    setup_console();

    let root_trie_hash = serde_wasm_bindgen::from_value::<HashHexString>(root_trie_hash)?;
    let proof = serde_wasm_bindgen::from_value::<Vec<HexString>>(nodes)?;
    let entries = serde_wasm_bindgen::from_value::<Vec<(HexString, Option<HexString>)>>(entries)?;
    let entries = BTreeMap::from_iter(
        entries
            .into_iter()
            .map(|(key, value)| (key.0, value.map(|x| x.0))),
    );
    let proof = proof::create_proof(
        root_trie_hash,
        proof.into_iter().map(|x| x.0).collect(),
        entries,
    )?;
    let result = serde_wasm_bindgen::to_value(&proof)?;

    Ok(result)
}

#[wasm_bindgen]
pub async fn run_task(task: JsValue, js: JsCallback) -> Result<JsValue, JsValue> {
    setup_console();

    let task = serde_wasm_bindgen::from_value::<task::TaskCall>(task)?;
    let result = task::run_task(task, js).await?;
    let result = serde_wasm_bindgen::to_value(&result)?;

    Ok(result)
}
