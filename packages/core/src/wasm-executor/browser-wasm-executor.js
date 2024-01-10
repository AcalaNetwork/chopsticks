import * as Comlink from 'comlink'
import * as pkg from '@acala-network/chopsticks-executor'

const getRuntimeVersion = async (code) => {
  return pkg.get_runtime_version(code)
}

// trie_version: 0 for old trie, 1 for new trie
const calculateStateRoot = async (entries, trie_version) => {
  return pkg.calculate_state_root(entries, trie_version)
}

const decodeProof = async (trieRootHash, nodes) => {
  return pkg.decode_proof(trieRootHash, nodes)
}

const createProof = async (nodes, updates) => {
  return pkg.create_proof(nodes, updates)
}

const runTask = async (task, callback) => {
  return pkg.run_task(task, callback, 'info')
}

const testing = async (callback, key) => {
  return pkg.testing(callback, key)
}

const startNetworkService = async (config, callback) => {
  return pkg.start_network_service(config, callback)
}

const connectionStreamOpened = async (connectionId, streamId, outbound) => {
  return pkg.connection_stream_opened(connectionId, streamId, outbound)
}

const connectionReset = async (connectionId, data) => {
  return pkg.connection_reset(connectionId, data)
}

const streamReset = async (connectionId, streamId) => {
  return pkg.stream_reset(connectionId, streamId)
}

const streamMessage = async (connectionId, streamId, data) => {
  return pkg.stream_message(connectionId, streamId, data)
}

const streamWritableBytes = async (connectionId, streamId, bytes) => {
  return pkg.stream_writable_bytes(connectionId, streamId, bytes)
}

const timerFinished = async (callback) => {
  return pkg.timer_finished(callback)
}

const storageRequest = async (chainId, req, callback) => {
  return pkg.storage_request(chainId, req, callback)
}

const blocksRequest = async (chainId, req, callback) => {
  return pkg.blocks_request(chainId, req, callback)
}

const getPeers = async (chainId) => {
  return pkg.peers_list(chainId)
}

const getLatestBlock = async (chainId) => {
  return pkg.latest_block(chainId)
}

const wasmExecutor = {
  runTask,
  getRuntimeVersion,
  calculateStateRoot,
  createProof,
  decodeProof,
  testing,
  startNetworkService,
  storageRequest,
  blocksRequest,
  getPeers,
  getLatestBlock,
  connectionStreamOpened,
  connectionReset,
  streamReset,
  streamMessage,
  streamWritableBytes,
  timerFinished,
}

Comlink.expose(wasmExecutor)
