extern crate console_error_panic_hook;

use serde::{Deserialize, Serialize};
use smoldot::{
    json_rpc::methods::{HashHexString, HexString},
    libp2p::PeerId,
    network::{
        self,
        service::{Multiaddr, Role},
    },
};
use smoldot_light::network_service::{Config, ConfigChain, NetworkService, NetworkServiceChain};
use std::{
    collections::BTreeMap,
    num::NonZeroU32,
    str::FromStr,
    sync::{Arc, Mutex},
    time::Duration,
};
use wasm_bindgen::prelude::*;

use crate::{platform::JsPlatform, proof::inner_decode_proof, setup_console};

#[wasm_bindgen(typescript_custom_section)]
const _: &'static str = r#"
export interface JsLightClientCallback {
    startTimer: (delay: number) => void
    connect: (connectionId: number, address: string, cert: Uint8Array) => void
    resetConnection: (connectionId: number) => void
    connectionStreamOpen: (connectionId: number) => void
    connectionStreamReset: (connectionId: number, streamId: number) => void
    streamSend: (connectionId: number, data: Uint8Array) => void
    storageResponse: (response: StorageResponse) => void
    blockResponse: (response: BlocksResponse) => void
}

export type StorageRequest = {
    id: number
    blockHash: HexString
    keys: HexString[]
    retries: number
}

export type BlockRequest = {
    id: number
    blockNumber: number | null
    blockHash: HexString | null
    retries: number
}

export type StorageResponse = {
    id: number
    items: [HexString, HexString][]
    errorReason?: string
}

export type BlocksResponse = {
    id: number
    blocks: {
        hash: HexString,
        header: HexString,
        body: HexString[],
    }[]
    errorReason?: string
}
"#;

#[wasm_bindgen]
extern "C" {
    // global method retuning microsecond timestamp
    #[wasm_bindgen(js_name = "monotonic")]
    pub fn monotonic_clock_us() -> u64;

    #[wasm_bindgen(typescript_type = "JsLightClientCallback")]
    #[derive(Debug)]
    pub type JsLightClientCallback;

    #[wasm_bindgen(structural, method, js_name = "startTimer")]
    pub fn start_timer(this: &JsLightClientCallback, delay: u64);

    #[wasm_bindgen(structural, method, js_name = "connect")]
    pub fn connect(this: &JsLightClientCallback, conn_id: u32, address: String, cert: Vec<u8>);

    #[wasm_bindgen(structural, method, js_name = "connectionStreamOpen")]
    pub fn connection_stream_open(this: &JsLightClientCallback, conn_id: u32);

    #[wasm_bindgen(structural, method, js_name = "connectionStreamReset")]
    pub fn connection_stream_reset(this: &JsLightClientCallback, conn_id: u32, stream_id: u32);

    #[wasm_bindgen(structural, method, js_name = "streamSend")]
    pub fn stream_send(this: &JsLightClientCallback, conn_id: u32, data: Vec<u8>);

    #[wasm_bindgen(structural, method, js_name = "resetConnection")]
    pub fn reset_connection(this: &JsLightClientCallback, conn_id: u32);

    #[wasm_bindgen(structural, method, js_name = "storageResponse")]
    pub fn storage_response(this: &JsLightClientCallback, response: JsValue);

    #[wasm_bindgen(structural, method, js_name = "blockResponse")]
    pub fn block_response(this: &JsLightClientCallback, response: JsValue);
}

unsafe impl Sync for JsLightClientCallback {}
unsafe impl Send for JsLightClientCallback {}

struct Chain {
    network_service: Arc<NetworkServiceChain<JsPlatform>>,
    peers: Mutex<BTreeMap<PeerId, (Role, u64, HashHexString)>>,
}

impl Chain {
    fn new(chain: Arc<NetworkServiceChain<JsPlatform>>) -> Self {
        Self {
            network_service: chain,
            peers: Mutex::new(BTreeMap::new()),
        }
    }

    fn peers(&self) -> Vec<(PeerId, Role, u64, HashHexString)> {
        self.peers
            .lock()
            .unwrap()
            .iter()
            .map(|(peer_id, (role, best_number, best_hash))| {
                (peer_id.clone(), *role, *best_number, best_hash.clone())
            })
            .collect()
    }

    fn peers_list(&self) -> Vec<PeerId> {
        self.peers.lock().unwrap().keys().cloned().collect()
    }

    fn is_connected(&self) -> bool {
        !self.peers.lock().unwrap().is_empty()
    }

    fn latest_block(&self) -> Option<(u64, HashHexString)> {
        let mut values = self
            .peers
            .lock()
            .unwrap()
            .values()
            .map(|(_, best_number, best_hash)| (*best_number, best_hash.clone()))
            .collect::<Vec<_>>();
        values.sort_by(|(a, _), (b, _)| b.cmp(a));
        values.first().map(|(number, hash)| (*number, hash.clone()))
    }
}

static CHAINS: Mutex<BTreeMap<usize, Arc<Chain>>> = Mutex::new(BTreeMap::new());

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct NetworkServiceConfig {
    genesis_block_hash: HashHexString,
    bootnodes: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StorageRequest {
    id: usize,
    block_hash: HashHexString,
    keys: Vec<HexString>,
    retries: usize,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StorageResponse {
    id: usize,
    items: Vec<(HexString, HexString)>,
    error_reason: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BlockRequest {
    id: usize,
    block_hash: Option<HashHexString>,
    block_number: Option<u64>,
    retries: usize,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Block {
    hash: HashHexString,
    header: HexString,
    body: Vec<HexString>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BlocksResponse {
    id: usize,
    blocks: Vec<Block>,
    error_reason: Option<String>,
}

#[wasm_bindgen]
pub async fn start_network_service(
    config: JsValue,
    callback: JsLightClientCallback,
) -> Result<usize, JsValue> {
    setup_console(None);

    let platform = JsPlatform {
        callback: Arc::new(callback),
    };

    let network_service = NetworkService::new(Config {
        platform,
        identify_agent_version: concat!(env!("CARGO_PKG_NAME"), " ", env!("CARGO_PKG_VERSION"))
            .to_owned(),
        chains_capacity: 1,
        connections_open_pool_size: 8,
        connections_open_pool_restore_delay: Duration::from_secs(3),
    });

    let config = serde_wasm_bindgen::from_value::<NetworkServiceConfig>(config)?;

    let mut addrs = BTreeMap::<PeerId, Vec<Multiaddr>>::new();
    for node in config.bootnodes {
        let mut parts = node.split("/p2p/");

        let addr = parts.next().ok_or("invalid bootstrap node format")?;
        let peer_id = parts.next().ok_or("invalid bootstrap node format")?;

        if !addr.ends_with("/ws") && !addr.ends_with("/wss") {
            return Err("invalid bootstrap node format, only websocket is supported".into());
        }

        let addr = Multiaddr::from_str(addr).map_err(|e| e.to_string())?;
        let peer_id = PeerId::from_str(peer_id).map_err(|e| e.to_string())?;

        addrs.entry(peer_id).or_default().push(addr);
    }

    let chain = network_service.add_chain(ConfigChain {
        log_name: "chopsticks".to_string(),
        num_out_slots: 10,
        genesis_block_hash: config.genesis_block_hash.0,
        best_block: (0, config.genesis_block_hash.0),
        fork_id: None,
        block_number_bytes: 4,
        grandpa_protocol_finalized_block_height: None,
    });

    let events = chain.subscribe().await;
    let (connected_tx, connected_rx) = async_channel::unbounded::<()>();

    let chain_state = Arc::new(Chain::new(chain.clone()));
    let state = chain_state.clone();

    wasm_bindgen_futures::spawn_local(async move {
        loop {
            match events.recv().await {
                Ok(smoldot_light::network_service::Event::Connected {
                    peer_id,
                    role,
                    best_block_number,
                    best_block_hash,
                }) => {
                    if !connected_tx.is_closed() {
                        connected_tx.send(()).await.unwrap();
                        connected_tx.close();
                    }
                    let mut peers = state.peers.lock().unwrap();
                    peers.insert(
                        peer_id,
                        (role, best_block_number, HashHexString(best_block_hash)),
                    );
                }
                Ok(smoldot_light::network_service::Event::Disconnected { peer_id }) => {
                    let mut peers = state.peers.lock().unwrap();
                    peers.remove(&peer_id);
                }
                Ok(_) => {
                    // ignore
                }
                Err(_) => break,
            }
        }
    });

    chain.discover(addrs, true).await;
    connected_rx.recv().await.map_err(|e| e.to_string())?;

    let mut chains = CHAINS.lock().unwrap();
    let chain_id = chains.len();
    chains.insert(chain_id, chain_state);

    Ok(chain_id)
}

#[wasm_bindgen]
pub fn stream_message(connection_id: u32, stream_id: u32, data: Vec<u8>) {
    crate::platform::stream_message(connection_id, stream_id, data);
}

#[wasm_bindgen]
pub fn stream_writable_bytes(connection_id: u32, stream_id: u32, num_bytes: u32) {
    crate::platform::stream_writable_bytes(connection_id, stream_id, num_bytes);
}

#[wasm_bindgen]
pub fn connection_reset(connection_id: u32, data: Vec<u8>) {
    crate::platform::connection_reset(connection_id, data);
}

#[wasm_bindgen]
pub fn stream_reset(connection_id: u32, stream_id: u32, data: Vec<u8>) {
    crate::platform::stream_reset(connection_id, stream_id, data);
}

#[wasm_bindgen]
pub fn timer_finished(callback: JsLightClientCallback) {
    crate::timers::timer_finished(Arc::new(callback));
}

#[wasm_bindgen]
pub fn connection_stream_opened(connection_id: u32, stream_id: u32, outbound: u32) {
    crate::platform::connection_stream_opened(connection_id, stream_id, outbound);
}

#[wasm_bindgen]
pub async fn storage_request(
    chain_id: usize,
    request: JsValue,
    callback: JsLightClientCallback,
) -> Result<(), JsValue> {
    setup_console(None);

    let chains = CHAINS.lock().unwrap();
    let chain = chains.get(&chain_id).cloned().ok_or("chain not found")?;
    drop(chains);

    let StorageRequest {
        id,
        block_hash,
        keys,
        mut retries,
    } = serde_wasm_bindgen::from_value::<StorageRequest>(request)?;

    if !chain.is_connected() {
        return Err("no peers".into());
    }
    let peers = chain.peers_list();
    let mut index = id % peers.len();
    let mut peer_id = peers.get(index).cloned().expect("index out of range");

    wasm_bindgen_futures::spawn_local(async move {
        let config = network::codec::StorageProofRequestConfig {
            block_hash: block_hash.0,
            keys: keys.clone().into_iter().map(|x| x.0),
        };

        loop {
            let proof = chain
                .network_service
                .clone()
                .storage_proof_request(peer_id.clone(), config.clone(), Duration::from_secs(30))
                .await;

            match proof {
                Ok(proof) => {
                    let result = inner_decode_proof(
                        smoldot::trie::proof_decode::Config {
                            proof: proof.decode().to_vec(),
                        },
                        None,
                    );

                    match result {
                        Ok(items) => {
                            let response = StorageResponse {
                                id,
                                items,
                                error_reason: None,
                            };
                            callback
                                .storage_response(serde_wasm_bindgen::to_value(&response).unwrap());
                        }
                        Err(e) => {
                            let response = StorageResponse {
                                id,
                                items: vec![],
                                error_reason: Some(e.to_string()),
                            };
                            callback
                                .storage_response(serde_wasm_bindgen::to_value(&response).unwrap());
                        }
                    }
                    break;
                }
                Err(err) => {
                    if retries == 0 {
                        let response = StorageResponse {
                            id,
                            items: vec![],
                            error_reason: Some(err.to_string()),
                        };
                        callback.storage_response(serde_wasm_bindgen::to_value(&response).unwrap());
                        break;
                    }

                    log::debug!(
                        "storage proof request failed with error {:?}, try next peer",
                        err
                    );

                    // rotate peer
                    let peers = chain.peers_list();
                    if peers.len() == 0 {
                        let response = StorageResponse {
                            id,
                            items: vec![],
                            error_reason: Some("no peers".to_string()),
                        };
                        callback.storage_response(serde_wasm_bindgen::to_value(&response).unwrap());
                        break;
                    }
                    index = index.saturating_add(1) % peers.len();
                    peer_id = peers.get(index).cloned().expect("index out of range");
                    retries = retries.saturating_sub(1);
                }
            }
        }
    });

    Ok(())
}

#[wasm_bindgen]
pub async fn blocks_request(
    chain_id: usize,
    request: JsValue,
    callback: JsLightClientCallback,
) -> Result<(), JsValue> {
    setup_console(None);

    let chains = CHAINS.lock().unwrap();
    let chain = chains.get(&chain_id).cloned().ok_or("chain not found")?;
    drop(chains);

    let BlockRequest {
        id,
        block_hash,
        block_number,
        mut retries,
    } = serde_wasm_bindgen::from_value::<BlockRequest>(request)?;

    if !chain.is_connected() {
        return Err("no peers".into());
    }
    let peers = chain.peers_list();
    let mut index = id % peers.len();
    let mut peer_id = peers.get(index).cloned().expect("index out of range");

    wasm_bindgen_futures::spawn_local(async move {
        let config = network::codec::BlocksRequestConfig {
            start: if block_hash.is_some() {
                network::codec::BlocksRequestConfigStart::Hash(block_hash.clone().unwrap().0)
            } else {
                network::codec::BlocksRequestConfigStart::Number(block_number.unwrap_or(0))
            },
            direction: network::codec::BlocksRequestDirection::Descending,
            desired_count: NonZeroU32::new(1).unwrap(),
            fields: network::codec::BlocksRequestFields {
                header: true,
                body: true,
                justifications: false,
            },
        };

        loop {
            let response = chain
                .network_service
                .clone()
                .blocks_request(peer_id.clone(), config.clone(), Duration::from_secs(30))
                .await;

            match response {
                Ok(blocks) => {
                    let blocks = blocks
                        .into_iter()
                        .map(|block| Block {
                            hash: HashHexString(block.hash),
                            header: HexString(block.header.unwrap_or_default()),
                            body: block
                                .body
                                .unwrap_or_default()
                                .into_iter()
                                .map(|x| HexString(x))
                                .collect(),
                        })
                        .collect::<Vec<_>>();

                    let response = BlocksResponse {
                        id,
                        blocks,
                        error_reason: None,
                    };
                    callback.block_response(serde_wasm_bindgen::to_value(&response).unwrap());
                    break;
                }
                Err(err) => {
                    if retries == 0 {
                        let response = BlocksResponse {
                            id,
                            blocks: vec![],
                            error_reason: Some(err.to_string()),
                        };
                        callback.block_response(serde_wasm_bindgen::to_value(&response).unwrap());
                        break;
                    }

                    log::debug!("blocks request failed with error {:?}, try next peer", err);

                    // rotate peer
                    let peers = chain.peers_list();
                    if peers.len() == 0 {
                        let response = BlocksResponse {
                            id,
                            blocks: vec![],
                            error_reason: Some("no peers".to_string()),
                        };
                        callback.block_response(serde_wasm_bindgen::to_value(&response).unwrap());
                        break;
                    }
                    index = index.saturating_add(1) % peers.len();
                    peer_id = peers.get(index).cloned().expect("index out of range");
                    retries = retries.saturating_sub(1);
                }
            }
        }
    });

    Ok(())
}

#[wasm_bindgen]
pub fn peers_list(chain_id: usize) -> Result<JsValue, JsValue> {
    let chains = CHAINS.lock().unwrap();
    let chain = chains.get(&chain_id).cloned().ok_or("chain not found")?;
    let peers = chain
        .peers()
        .into_iter()
        .map(|(peer_id, role, best_number, best_hash)| {
            (
                peer_id.to_string(),
                format!("{:?}", role),
                best_number,
                best_hash,
            )
        })
        .collect::<Vec<_>>();
    serde_wasm_bindgen::to_value(&peers).map_err(|x| x.into())
}

#[wasm_bindgen]
pub fn latest_block(chain_id: usize) -> Result<JsValue, JsValue> {
    let chains = CHAINS.lock().unwrap();
    let chain = chains.get(&chain_id).cloned().ok_or("chain not found")?;
    let latest = chain.latest_block().ok_or("no peers")?;
    serde_wasm_bindgen::to_value(&latest).map_err(|x| x.into())
}
