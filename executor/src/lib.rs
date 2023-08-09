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
    std::panic::set_hook(Box::new(console_error_panic_hook::hook));
    let level = level.map(|x| x.to_uppercase()).unwrap_or("INFO".into());
    let _ = console_log::init_with_level(log::Level::from_str(level.as_str()).unwrap());
}

#[wasm_bindgen(typescript_custom_section)]
const _: &'static str = r#"
import { HexString } from '@polkadot/util/types';
export interface JsCallback {
	getStorage: (key: HexString) => Promise<string | undefined>
	getStateRoot: () => Promise<string>
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

    #[wasm_bindgen(structural, method, js_name = "getStorage")]
    pub async fn get_storage(this: &JsCallback, key: JsValue) -> JsValue;

    #[wasm_bindgen(structural, method, js_name = "getStateRoot")]
    pub async fn get_state_root(this: &JsCallback) -> JsValue;

    #[wasm_bindgen(structural, method, js_name = "getNextKey")]
    pub async fn get_next_key(this: &JsCallback, prefix: JsValue, key: JsValue) -> JsValue;

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
    setup_console(None);

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
    setup_console(None);

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
    setup_console(None);

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
pub async fn create_proof(nodes: JsValue, entries: JsValue) -> Result<JsValue, JsValue> {
    setup_console(None);

    let proof = serde_wasm_bindgen::from_value::<Vec<HexString>>(nodes)?;
    let entries = serde_wasm_bindgen::from_value::<Vec<(HexString, Option<HexString>)>>(entries)?;
    let entries = BTreeMap::from_iter(
        entries
            .into_iter()
            .map(|(key, value)| (key.0, value.map(|x| x.0))),
    );
    let proof = proof::create_proof(proof.into_iter().map(|x| x.0).collect(), entries)?;
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
