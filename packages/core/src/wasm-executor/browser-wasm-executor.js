import * as Comlink from 'comlink'
import * as pkg from '@acala-network/chopsticks-executor'

const getRuntimeVersion = async (code) => {
  await pkg.wasmReady
  return pkg.get_runtime_version(code)
}

// trie_version: 0 for old trie, 1 for new trie
const calculateStateRoot = async (entries, trie_version) => {
  await pkg.wasmReady
  return pkg.calculate_state_root(entries, trie_version)
}

const decodeProof = async (trieRootHash, keys, nodes) => {
  await pkg.wasmReady
  return pkg.decode_proof(trieRootHash, keys, nodes)
}

const createProof = async (nodes, entries) => {
  await pkg.wasmReady
  return pkg.create_proof(nodes, entries)
}

const runTask = async (task, callback) => {
  await pkg.wasmReady
  return pkg.run_task(task, callback, 'info')
}

const wasmExecutor = { runTask, getRuntimeVersion, calculateStateRoot, createProof, decodeProof }

Comlink.expose(wasmExecutor)
