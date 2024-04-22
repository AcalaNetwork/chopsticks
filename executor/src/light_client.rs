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
    messageSend: (connectionId: number, data: Uint8Array) => void
    queryResponse: (requestId: number, response: Response) => void
}

export type Request =
    {
        storage: {
            hash: HexString
            keys: HexString[]
        }
    }
    |
    {
        block: {
            number: number | null
            hash: HexString | null
            header: boolean
            body: boolean
        }
    }

export type Response =
    {
        storage: [HexString, HexString][]
    }
    |
    {
        block: {
            hash: HexString
            header: HexString
            body: HexString[]
        }
    }
    |
    {
        error: string
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

    #[wasm_bindgen(structural, method, js_name = "messageSend")]
    pub fn message_send(this: &JsLightClientCallback, conn_id: u32, data: Vec<u8>);

    #[wasm_bindgen(structural, method, js_name = "resetConnection")]
    pub fn reset_connection(this: &JsLightClientCallback, conn_id: u32);

    #[wasm_bindgen(structural, method, js_name = "queryResponse")]
    pub fn query_response(this: &JsLightClientCallback, request_id: usize, response: JsValue);
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
enum Request {
    Storage {
        hash: HashHexString,
        keys: Vec<HexString>,
    },
    Block {
        hash: Option<HashHexString>,
        number: Option<u64>,
        header: bool,
        body: bool,
    },
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
enum Response {
    Storage(Vec<(HexString, HexString)>),
    Block(Block),
    Error(String),
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Block {
    hash: HashHexString,
    header: HexString,
    body: Vec<HexString>,
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
pub fn query_chain(
    chain_id: usize,
    request_id: usize,
    request: JsValue,
    mut retries: usize,
    callback: JsLightClientCallback,
) -> Result<(), JsValue> {
    setup_console(None);

    let chains = CHAINS.lock().unwrap();
    let chain = chains.get(&chain_id).cloned().ok_or("chain not found")?;
    drop(chains);

    let request = serde_wasm_bindgen::from_value::<Request>(request)?;

    wasm_bindgen_futures::spawn_local(async move {
        loop {
            if !chain.is_connected() {
                let response = Response::Error("no peers".to_string());
                callback
                    .query_response(request_id, serde_wasm_bindgen::to_value(&response).unwrap());
                break;
            }
            let peers = chain.peers_list();
            let index = request_id.saturating_add(retries) % peers.len();
            let peer_id = peers.get(index).cloned().expect("index out of range");
            retries = retries.saturating_sub(1);

            match &request {
                Request::Storage { hash, keys } => {
                    let proof = chain
                        .network_service
                        .clone()
                        .storage_proof_request(
                            peer_id,
                            network::codec::StorageProofRequestConfig {
                                block_hash: hash.0,
                                keys: keys.clone().into_iter().map(|x| x.0),
                            },
                            Duration::from_secs(30),
                        )
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
                                Ok(result) => {
                                    let response = Response::Storage(result);
                                    callback.query_response(
                                        request_id,
                                        serde_wasm_bindgen::to_value(&response).unwrap(),
                                    );
                                    break;
                                }
                                Err(reason) => {
                                    log::debug!(
                                        "storage proof decode failed with error {:?}, try next peer",
                                        reason
                                    );
                                }
                            }
                        }
                        Err(err) => {
                            log::debug!(
                                "storage proof request failed with error {:?}, try next peer",
                                err
                            );
                        }
                    }
                }
                Request::Block {
                    hash,
                    number,
                    header,
                    body,
                } => {
                    let response = chain
                        .network_service
                        .clone()
                        .blocks_request(
                            peer_id,
                            network::codec::BlocksRequestConfig {
                                start: if hash.is_some() {
                                    network::codec::BlocksRequestConfigStart::Hash(
                                        hash.clone().unwrap().0,
                                    )
                                } else {
                                    network::codec::BlocksRequestConfigStart::Number(
                                        number.unwrap_or(0),
                                    )
                                },
                                direction: network::codec::BlocksRequestDirection::Descending,
                                desired_count: NonZeroU32::new(1).unwrap(),
                                fields: network::codec::BlocksRequestFields {
                                    header: *header,
                                    body: *body,
                                    justifications: false,
                                },
                            },
                            Duration::from_secs(30),
                        )
                        .await;

                    match response {
                        Ok(blocks) => {
                            let mut result = blocks
                                .into_iter()
                                .map(|block| Block {
                                    hash: HashHexString(block.hash),
                                    header: HexString(block.header.unwrap_or_default()),
                                    body: block
                                        .body
                                        .unwrap_or_default()
                                        .into_iter()
                                        .map(HexString)
                                        .collect(),
                                })
                                .collect::<Vec<_>>();
                            if result.is_empty() {
                                log::debug!("blocks request returned empty result, try next peer");
                                continue;
                            }

                            let response = Response::Block(result.remove(0));
                            callback.query_response(
                                request_id,
                                serde_wasm_bindgen::to_value(&response).unwrap(),
                            );
                            break;
                        }
                        Err(err) => {
                            log::debug!(
                                "blocks request failed with error {:?}, try next peer",
                                err
                            );
                        }
                    }
                }
            }

            if retries == 0 {
                let response = Response::Error("query out of retries".to_string());
                callback
                    .query_response(request_id, serde_wasm_bindgen::to_value(&response).unwrap());
                break;
            }
        }
    });

    Ok(())
}

#[wasm_bindgen]
pub fn message_received(connection_id: u32, data: Vec<u8>) {
    crate::platform::message_received(connection_id, data);
}

#[wasm_bindgen]
pub fn connection_writable_bytes(connection_id: u32, num_bytes: u32) {
    crate::platform::connection_writable_bytes(connection_id, num_bytes);
}

#[wasm_bindgen]
pub fn connection_reset(connection_id: u32) {
    crate::platform::connection_reset(connection_id);
}

#[wasm_bindgen]
pub fn wake_up(callback: JsLightClientCallback) {
    crate::timers::wake_up(Arc::new(callback));
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
                format!("{role:?}"),
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
