import * as Comlink from 'comlink'
import * as pkg from '@acala-network/chopsticks-executor'

import { parentPort } from 'node:worker_threads'
import nodeEndpoint from 'comlink/dist/umd/node-adapter.js'

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
  return pkg.run_task(task, callback, process.env.RUST_LOG)
}

const testing = async (callback, key) => {
  return pkg.testing(callback, key)
}

const wasmExecutor = { runTask, getRuntimeVersion, calculateStateRoot, createProof, decodeProof, testing }

Comlink.expose(wasmExecutor, nodeEndpoint(parentPort))
