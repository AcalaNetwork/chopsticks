use wasm_bindgen::prelude::*;

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = _chopsticks_binding_, js_name = "getStorage")]
    pub async fn get_storage(hash: JsValue, key: JsValue) -> JsValue;

    #[wasm_bindgen(js_namespace = _chopsticks_binding_, js_name = "getPrefixKeys")]
    pub async fn get_prefix_keys(hash: JsValue, key: JsValue) -> JsValue;

    #[wasm_bindgen(js_namespace = _chopsticks_binding_, js_name = "getNextKey")]
    pub async fn get_next_key(hash: JsValue, key: JsValue) -> JsValue;
}
