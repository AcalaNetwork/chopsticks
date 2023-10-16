import { wrap } from 'comlink'
import nodeEndpoint from 'comlink/dist/umd/node-adapter.js'
import threads from 'node:worker_threads'
import url from 'node:url'
import type { WasmExecutor } from '.'

export const startWorker = async () => {
  const worker = new threads.Worker(url.resolve(__filename, 'node-wasm-executor.mjs'), {
    name: 'chopsticks-wasm-executor',
  })
  return {
    remote: wrap<WasmExecutor>(nodeEndpoint(worker)),
    terminate: async () => {
      await worker.terminate()
    },
  }
}
