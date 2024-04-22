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

const connectionReset = async (connectionId) => {
  return pkg.connection_reset(connectionId)
}

const messageRecieved = async (connectionId, data) => {
  return pkg.message_received(connectionId, data)
}

const connectionWritableBytes = async (connectionId, bytes) => {
  return pkg.connection_writable_bytes(connectionId, bytes)
}

const wakeUp = async (callback) => {
  return pkg.wake_up(callback)
}

const queryChain = async (chainId, requestId, request, retries, callback) => {
  return pkg.query_chain(chainId, requestId, request, retries, callback)
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
  queryChain,
  getPeers,
  getLatestBlock,
  connectionReset,
  messageRecieved,
  connectionWritableBytes,
  wakeUp,
}

Comlink.expose(wasmExecutor)
