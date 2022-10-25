import { ApiPromise, WsProvider } from '@polkadot/api'
import { beforeAll, beforeEach } from 'vitest'

import { Blockchain } from '../src/blockchain'
import { TaskManager } from '../src/task'
import { createServer } from '../src/server'
import { handler } from '../src/rpc'

const setupAll = async () => {
  const endpoint = 'wss://mandala-rpc.aca-staging.network/ws'
  const executorCmd = 'cargo run --manifest-path executor/Cargo.toml --'
  const blockHash = '0x68cff8682eda3e5e63b375253bdb3a01f0dce1879fe7ade97c9697406c56b55a'

  const wsProvider = new WsProvider(endpoint)
  const api = await ApiPromise.create({ provider: wsProvider })

  await api.isReady

  const header = await api.rpc.chain.getHeader(blockHash)

  return {
    async setup() {
      const tasks = new TaskManager(executorCmd, 8000)

      const chain = new Blockchain(api, tasks, { hash: blockHash, number: header.number.toNumber() })

      const context = { chain, api, ws: wsProvider, tasks }

      const { port: listeningPortPromise, close } = createServer(0, handler(context))
      const listeningPort = await listeningPortPromise

      tasks.updateListeningPort(listeningPort)

      const wsProvider2 = new WsProvider(`ws://localhost:${listeningPort}`)
      const api2 = await ApiPromise.create({ provider: wsProvider2 })

      return {
        api: api2,
        async teardown() {
          await api2.disconnect()
          await close()
        },
      }
    },
    async teardownAll() {
      await api.disconnect()
    },
  }
}

export let api: ApiPromise

let setup: Awaited<ReturnType<typeof setupAll>>['setup']

beforeAll(async () => {
  const res = await setupAll()
  setup = res.setup
  return res.teardownAll
})

beforeEach(async () => {
  const res = await setup()
  api = res.api
  return res.teardown
})
