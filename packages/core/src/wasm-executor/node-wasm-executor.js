import { parentPort } from 'node:worker_threads'
import * as pkg from '@acala-network/chopsticks-executor'
import * as Comlink from 'comlink'
import nodeEndpoint from 'comlink/dist/umd/node-adapter.js'

// Worker-side WASM cache. The main thread registers WASMs by hash once,
// then subsequent runTask calls send only the hash to avoid repeated
// structured clones of the full WASM blob across the worker boundary.
const wasmCache = new Map()

const registerWasm = async (hash, wasm) => {
  wasmCache.set(hash, wasm)
}

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

// Build a trie from flat KV entries and return (rootHash, proofNodes).
// See proof.rs::create_proof_from_entries for the Rust implementation.
const createProofFromEntries = async (entries) => {
  return pkg.create_proof_from_entries(entries)
}

const runTask = async (task, callback) => {
  // If the task carries a wasmHash instead of the full wasm blob,
  // look it up in the cache. This avoids re-transferring large WASMs.
  if (task.wasmHash && !task.wasm) {
    const wasm = wasmCache.get(task.wasmHash)
    if (!wasm) throw new Error(`WASM not registered for hash: ${task.wasmHash}`)
    task = { ...task, wasm }
    delete task.wasmHash
  }
  return pkg.run_task(task, callback)
}

const testing = async (callback, key) => {
  return pkg.testing(callback, key)
}

const wasmExecutor = { runTask, getRuntimeVersion, calculateStateRoot, createProof, createProofFromEntries, decodeProof, testing, registerWasm }

Comlink.expose(wasmExecutor, nodeEndpoint(parentPort))
