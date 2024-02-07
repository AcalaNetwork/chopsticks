extern crate console_error_panic_hook;

use smoldot::{
    json_rpc::methods::{HashHexString, HexString},
    trie::TrieEntryVersion,
};
use std::{collections::BTreeMap, str::FromStr};
use wasm_bindgen::prelude::*;

mod proof;
mod task;

fn setup_console(level: Option<String>) {
    console_error_panic_hook::set_once();
    let level = level.map(|x| x.to_uppercase()).unwrap_or("INFO".into());
    let _ = console_log::init_with_level(log::Level::from_str(level.as_str()).unwrap());
}

#[wasm_bindgen(typescript_custom_section)]
const _: &'static str = r#"
type HexString = `0x${string}`;
export interface JsCallback {
	getStorage: (key: HexString) => Promise<string | undefined>
	getNextKey: (prefix: HexString, key: HexString) => Promise<string | undefined>
	offchainGetStorage: (key: HexString) => Promise<string | undefined>
	offchainTimestamp: () => Promise<number>
	offchainRandomSeed: () => Promise<HexString>
	offchainSubmitTransaction: (tx: HexString) => Promise<boolean>
}
"#;

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(typescript_type = "JsCallback")]
    pub type JsCallback;

    #[wasm_bindgen(catch, structural, method, js_name = "getStorage")]
    pub async fn get_storage(this: &JsCallback, key: JsValue) -> Result<JsValue, JsValue>;

    #[wasm_bindgen(catch, structural, method, js_name = "getNextKey")]
    pub async fn get_next_key(
        this: &JsCallback,
        prefix: JsValue,
        key: JsValue,
    ) -> Result<JsValue, JsValue>;

    #[wasm_bindgen(catch, structural, method, js_name = "offchainGetStorage")]
    pub async fn offchain_get_storage(this: &JsCallback, key: JsValue) -> Result<JsValue, JsValue>;

    #[wasm_bindgen(catch, structural, method, js_name = "offchainTimestamp")]
    pub async fn offchain_timestamp(this: &JsCallback) -> Result<JsValue, JsValue>;

    #[wasm_bindgen(catch, structural, method, js_name = "offchainRandomSeed")]
    pub async fn offchain_random_seed(this: &JsCallback) -> Result<JsValue, JsValue>;

    #[wasm_bindgen(catch, structural, method, js_name = "offchainSubmitTransaction")]
    pub async fn offchain_submit_transaction(
        this: &JsCallback,
        tx: JsValue,
    ) -> Result<JsValue, JsValue>;
}

#[wasm_bindgen]
pub async fn get_runtime_version(code: JsValue) -> Result<JsValue, JsError> {
    setup_console(None);

    let code = serde_wasm_bindgen::from_value::<HexString>(code)?;
    let runtime_version = task::runtime_version(code).await;
    let result = serde_wasm_bindgen::to_value(&runtime_version)?;

    Ok(result)
}

#[wasm_bindgen]
pub async fn calculate_state_root(
    entries: JsValue,
    trie_version: JsValue,
) -> Result<JsValue, JsError> {
    setup_console(None);

    let entries = serde_wasm_bindgen::from_value::<Vec<(HexString, HexString)>>(entries)?;
    let trie_version = serde_wasm_bindgen::from_value::<u8>(trie_version)?;
    let trie_version = TrieEntryVersion::try_from(trie_version)
        .map_err(|_| JsError::new("invalid trie version"))?;
    let hash = task::calculate_state_root(entries, trie_version);
    let result = serde_wasm_bindgen::to_value(&hash)?;

    Ok(result)
}

#[wasm_bindgen]
pub async fn decode_proof(trie_root_hash: JsValue, nodes: JsValue) -> Result<JsValue, JsError> {
    setup_console(None);

    let trie_root_hash = serde_wasm_bindgen::from_value::<HashHexString>(trie_root_hash)?;
    let nodes = serde_wasm_bindgen::from_value::<Vec<HexString>>(nodes)?;
    let entries = proof::decode_proof(trie_root_hash, nodes.into_iter().map(|x| x.0).collect())
        .map_err(|e| JsError::new(e.as_str()))?;
    let result = serde_wasm_bindgen::to_value(&entries)?;

    Ok(result)
}

#[wasm_bindgen]
pub async fn create_proof(nodes: JsValue, updates: JsValue) -> Result<JsValue, JsError> {
    setup_console(None);

    let proof = serde_wasm_bindgen::from_value::<Vec<HexString>>(nodes)?;
    let updates = serde_wasm_bindgen::from_value::<Vec<(HexString, Option<HexString>)>>(updates)?;
    let updates = BTreeMap::from_iter(
        updates
            .into_iter()
            .map(|(key, value)| (key.0, value.map(|x| x.0))),
    );
    let proof = proof::create_proof(proof.into_iter().map(|x| x.0).collect(), updates)
        .map_err(|e| JsError::new(e.as_str()))?;
    let result = serde_wasm_bindgen::to_value(&proof)?;

    Ok(result)
}

#[wasm_bindgen]
pub async fn run_task(
    task: JsValue,
    js: JsCallback,
    log_level: Option<String>,
) -> Result<JsValue, JsValue> {
    setup_console(log_level);

    let task = serde_wasm_bindgen::from_value::<task::TaskCall>(task)?;
    let result = task::run_task(task, js).await?;
    let result = serde_wasm_bindgen::to_value(&result)?;

    Ok(result)
}

#[wasm_bindgen]
pub async fn testing(js: JsCallback, key: JsValue) -> Result<JsValue, JsValue> {
    setup_console(None);

    js.get_storage(key).await
}
