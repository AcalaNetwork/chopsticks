import { ApiPromise, WsProvider } from '@polkadot/api'
import { Codec } from '@polkadot/types/types'
import { Keyring } from '@polkadot/keyring'
import { beforeAll, beforeEach, expect, vi } from 'vitest'

import { Api } from '../src/api'
import { Blockchain } from '../src/blockchain'
import { BuildBlockMode } from '../src/blockchain/txpool'
import { GenesisProvider } from '../src/genesis-provider'
import { InherentProviders, SetTimestamp, SetValidationData } from '../src/blockchain/inherents'
import { ProviderInterface } from '@polkadot/rpc-provider/types'
import { StorageValues } from '../src/utils/set-storage'
import { TaskManager } from '../src/task'
import { createServer } from '../src/server'
import { handler } from '../src/rpc'

export type SetupOption = {
  endpoint?: string
  blockHash?: string
  mockSignatureHost?: boolean
  allowUnresolvedImports?: boolean
  genesis?: string
}

export const env = {
  mandala: {
    endpoint: 'wss://mandala-rpc.aca-staging.network/ws',
    blockHash: '0x062327512615cd62ea8c57652a04a6c937b112f1410520d83e2fafb9776cdbe1',
  },
  rococo: {
    endpoint: 'wss://rococo-rpc.polkadot.io',
    blockHash: '0xd7fef00504decd41d5d2e9a04346f6bc639fd428083e3ca941f636a8f88d456a',
  },
  mandalaGenesis: {
    genesis: 'https://raw.githubusercontent.com/AcalaNetwork/Acala/master/resources/mandala-dist.json',
  },
}

const setupAll = async ({ endpoint, blockHash, mockSignatureHost, allowUnresolvedImports, genesis }: SetupOption) => {
  let wsProvider: ProviderInterface
  if (genesis) {
    wsProvider = await GenesisProvider.fromUrl(genesis)
  } else {
    wsProvider = new WsProvider(endpoint)
  }
  const api = new Api(wsProvider, { SetEvmOrigin: { payload: {}, extrinsic: {} } })

  await api.isReady

  const header = await api.getHeader(blockHash)

  return {
    async setup() {
      const tasks = new TaskManager(8000, mockSignatureHost, process.env.EXECUTOR_CMD, allowUnresolvedImports)

      let now = new Date('2022-10-30T00:00:00.000Z').getTime()
      const setTimestamp = new SetTimestamp(() => {
        now += 20000
        return now
      })
      const inherents = new InherentProviders(setTimestamp, [new SetValidationData(tasks)])

      const chain = new Blockchain({
        api,
        tasks,
        buildBlockMode: BuildBlockMode.Manual,
        inherentProvider: inherents,
        header: {
          hash: blockHash || (await api.getBlockHash(0)),
          number: Number(header.number),
        },
      })

      const context = { chain, api, ws: wsProvider, tasks }

      const { port: listeningPortPromise, close } = createServer(0, handler(context))
      const listeningPort = await listeningPortPromise

      tasks.updateListeningPort(listeningPort)

      const wsProvider2 = new WsProvider(`ws://localhost:${listeningPort}`)
      const api2 = await ApiPromise.create({
        provider: wsProvider2,
        signedExtensions: {
          SetEvmOrigin: {
            extrinsic: {},
            payload: {},
          },
        },
      })

      return {
        chain,
        ws: wsProvider2,
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
export let chain: Blockchain
export let ws: WsProvider

export const setupApi = (option: SetupOption) => {
  let setup: Awaited<ReturnType<typeof setupAll>>['setup']

  beforeAll(async () => {
    const res = await setupAll(option)
    setup = res.setup
    return () => res.teardownAll()
  })

  beforeEach(async () => {
    const res = await setup()
    api = res.api
    chain = res.chain
    ws = res.ws

    return res.teardown
  })
}

type CodecOrArray = Codec | Codec[]

export const expectJson = (codec: CodecOrArray | Promise<CodecOrArray>) => {
  return expect(Promise.resolve(codec).then((x) => (Array.isArray(x) ? x.map((x) => x.toJSON()) : x.toJSON()))).resolves
}

export const expectHex = (codec: CodecOrArray | Promise<CodecOrArray>) => {
  return expect(Promise.resolve(codec).then((x) => (Array.isArray(x) ? x.map((x) => x.toHex()) : x.toHex()))).resolves
}

export const dev = {
  newBlock: (param?: { count?: number; to?: number }): Promise<string> => {
    return ws.send('dev_newBlock', [param])
  },
  setStorages: (values: StorageValues, blockHash?: string) => {
    return ws.send('dev_setStorages', [values, blockHash])
  },
}

function defer<T>() {
  const deferred = {} as { resolve: (value: any) => void; reject: (reason: any) => void; promise: Promise<T> }
  deferred.promise = new Promise((resolve, reject) => {
    deferred.resolve = resolve
    deferred.reject = reject
  })
  return deferred
}

export const mockCallback = () => {
  let next = defer()
  const callback = vi.fn((...args) => {
    next.resolve(args)
    next = defer()
  })

  return {
    callback,
    next() {
      return next.promise
    },
  }
}

export const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export const testingPairs = (ss58Format?: number) => {
  const keyring = new Keyring({ type: 'ed25519', ss58Format }) // cannot use sr25519 as it is non determinstic
  const alice = keyring.addFromUri('//Alice')
  const bob = keyring.addFromUri('//Bob')
  const charlie = keyring.addFromUri('//Charlie')
  const dave = keyring.addFromUri('//Dave')
  const eve = keyring.addFromUri('//Eve')
  const test1 = keyring.addFromUri('//test1')
  const test2 = keyring.addFromUri('//test2')
  return {
    alice,
    bob,
    charlie,
    dave,
    eve,
    test1,
    test2,
    keyring,
  }
}
