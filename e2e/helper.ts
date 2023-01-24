import { ApiPromise, WsProvider } from '@polkadot/api'
import { Codec } from '@polkadot/types/types'
import { HexString } from '@polkadot/util/types'
import { Keyring } from '@polkadot/keyring'
import { beforeAll, beforeEach, expect, vi } from 'vitest'

import { Api } from '../src/api'
import { Blockchain } from '../src/blockchain'
import { BuildBlockMode } from '../src/blockchain/txpool'
import { GenesisProvider } from '../src/genesis-provider'
import {
  InherentProviders,
  ParaInherentEnter,
  SetBabeRandomness,
  SetNimbusAuthorInherent,
  SetTimestamp,
  SetValidationData,
} from '../src/blockchain/inherent'
import { StorageValues } from '../src/utils/set-storage'
import { createServer } from '../src/server'
import { handler } from '../src/rpc'

export type SetupOption = {
  endpoint?: string
  blockHash?: HexString
  mockSignatureHost?: boolean
  allowUnresolvedImports?: boolean
  genesis?: string
}

export const env = {
  mandala: {
    endpoint: 'wss://mandala-rpc.aca-staging.network/ws',
    blockHash: '0x062327512615cd62ea8c57652a04a6c937b112f1410520d83e2fafb9776cdbe1' as HexString,
  },
  rococo: {
    endpoint: 'wss://rococo-rpc.polkadot.io',
    blockHash: '0xd7fef00504decd41d5d2e9a04346f6bc639fd428083e3ca941f636a8f88d456a' as HexString,
  },
  mandalaGenesis: {
    genesis: 'https://raw.githubusercontent.com/AcalaNetwork/Acala/master/resources/mandala-dist.json',
  },
}

export const setupAll = async ({
  endpoint,
  blockHash,
  mockSignatureHost,
  allowUnresolvedImports,
  genesis,
}: SetupOption) => {
  const api = new Api(genesis ? await GenesisProvider.fromUrl(genesis) : new WsProvider(endpoint), {
    SetEvmOrigin: { payload: {}, extrinsic: {} },
  })

  await api.isReady

  const header = await api.getHeader(blockHash)

  return {
    async setup() {
      const inherents = new InherentProviders(new SetTimestamp(), [
        new SetValidationData(),
        new ParaInherentEnter(),
        new SetNimbusAuthorInherent(),
        new SetBabeRandomness(),
      ])

      const chain = new Blockchain({
        api,
        buildBlockMode: BuildBlockMode.Manual,
        inherentProvider: inherents,
        header: {
          hash: blockHash || (await api.getBlockHash()),
          number: Number(header.number),
        },
        mockSignatureHost,
        allowUnresolvedImports,
      })

      const { port, close } = await createServer(handler({ chain }))

      const ws = new WsProvider(`ws://localhost:${port}`)
      const apiPromise = await ApiPromise.create({
        provider: ws,
        signedExtensions: {
          SetEvmOrigin: {
            extrinsic: {},
            payload: {},
          },
        },
      })

      await apiPromise.isReady

      return {
        chain,
        ws,
        api: apiPromise,
        async teardown() {
          await apiPromise.disconnect()
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

export const matchSnapshot = (codec: CodecOrArray | Promise<CodecOrArray>) => {
  return expect(
    Promise.resolve(codec).then((x) => (Array.isArray(x) ? x.map((x) => x.toHuman()) : x.toHuman()))
  ).resolves.toMatchSnapshot()
}

export const dev = {
  newBlock: (param?: { count?: number; to?: number }): Promise<string> => {
    return ws.send('dev_newBlock', [param])
  },
  setStorage: (values: StorageValues, blockHash?: string) => {
    return ws.send('dev_setStorage', [values, blockHash])
  },
  timeTravel: (date: string | number) => {
    return ws.send<number>('dev_timeTravel', [date])
  },
  setHead: (hashOrNumber: string | number) => {
    return ws.send('dev_setHead', [hashOrNumber])
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
    setTimeout(() => {
      next.resolve(args)
      next = defer()
    }, 50)
  })

  return {
    callback,
    async next() {
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
