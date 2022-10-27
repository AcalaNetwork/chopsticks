import { ApiPromise, WsProvider } from '@polkadot/api'
import { Codec } from '@polkadot/types/types'
import { beforeAll, beforeEach, expect } from 'vitest'

import { Blockchain } from '../src/blockchain'
import { TaskManager } from '../src/task'
import { createServer } from '../src/server'
import { handler } from '../src/rpc'

const setupAll = async () => {
  const endpoint = 'wss://mandala-rpc.aca-staging.network/ws'
  const blockHash = '0x68cff8682eda3e5e63b375253bdb3a01f0dce1879fe7ade97c9697406c56b55a'

  const wsProvider = new WsProvider(endpoint)
  const api = await ApiPromise.create({ provider: wsProvider })

  await api.isReady

  const header = await api.rpc.chain.getHeader(blockHash)

  return {
    async setup() {
      const tasks = new TaskManager(8000, process.env.EXECUTOR_CMD)

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
          await new Promise((resolve) => setTimeout(resolve, 1000))
          await close()
        },
      }
    },
    async teardownAll() {
      await new Promise((resolve) => setTimeout(resolve, 1000))
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

type CodecOrArray = Codec | Codec[]

export const expectJson = (codec: CodecOrArray | Promise<CodecOrArray>) => {
  return expect(Promise.resolve(codec).then((x) => (Array.isArray(x) ? x.map((x) => x.toJSON()) : x.toJSON()))).resolves
}

export const expectHex = (codec: CodecOrArray | Promise<CodecOrArray>) => {
  return expect(Promise.resolve(codec).then((x) => (Array.isArray(x) ? x.map((x) => x.toHex()) : x.toHex()))).resolves
}
