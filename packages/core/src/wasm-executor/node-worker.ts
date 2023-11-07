import { wrap } from 'comlink'
import nodeEndpoint from 'comlink/dist/umd/node-adapter.js'
import threads from 'node:worker_threads'

export const startWorker = async <T>() => {
  const worker = new threads.Worker(new URL('node-wasm-executor.js', import.meta.url), {
    name: 'chopsticks-wasm-executor',
  })
  return {
    remote: wrap<T>((nodeEndpoint as any)(worker)),
    terminate: async () => {
      await worker.terminate()
    },
  }
}
