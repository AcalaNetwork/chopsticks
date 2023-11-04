import { wrap } from 'comlink'
import nodeEndpoint from 'comlink/dist/umd/node-adapter.js'
import threads from 'node:worker_threads'

export const startWorker = async <T>() => {
  const workerCode = `
    const Comlink = require('comlink')
    const pkg = require('@acala-network/chopsticks-executor')
    const { parentPort } = require('node:worker_threads')
    const nodeEndpoint = require('comlink/dist/umd/node-adapter.js')

    const getRuntimeVersion = async (code) => {
      return pkg.get_runtime_version(code)
    }

    // trie_version: 0 for old trie, 1 for new trie
    const calculateStateRoot = async (entries, trie_version) => {
      return pkg.calculate_state_root(entries, trie_version)
    }

    const decodeProof = async (trieRootHash, keys, nodes) => {
      return pkg.decode_proof(trieRootHash, keys, nodes)
    }

    const createProof = async (nodes, entries) => {
      return pkg.create_proof(nodes, entries)
    }

    const runTask = async (task, callback) => {
      return pkg.run_task(task, callback, process.env.RUST_LOG)
    }

    const wasmExecutor = { runTask, getRuntimeVersion, calculateStateRoot, createProof, decodeProof }

    Comlink.expose(wasmExecutor, nodeEndpoint(parentPort))
    `
  const worker = new threads.Worker(workerCode, {
    name: 'chopsticks-wasm-executor',
    eval: true,
  })
  return {
    remote: wrap<T>(nodeEndpoint(worker)),
    terminate: async () => {
      await worker.terminate()
    },
  }
}
