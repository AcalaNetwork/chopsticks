import { wrap } from 'comlink'
import type { WasmExecutor } from '.'

export const startWorker = async () => {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  const worker = new Worker(new URL('browser-wasm-executor.mjs', import.meta.url), {
    type: 'module',
    name: 'chopsticks-wasm-executor',
  })
  return {
    remote: wrap<WasmExecutor>(worker),
    terminate: async () => {
      worker.terminate()
    },
  }
}
