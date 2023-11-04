import { wrap } from 'comlink'

export const startWorker = async <T>() => {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  const worker = new Worker(new URL('browser-wasm-executor.mjs', import.meta.url), {
    type: 'module',
    name: 'chopsticks-wasm-executor',
  })
  return {
    remote: wrap<T>(worker),
    terminate: async () => {
      worker.terminate()
    },
  }
}
