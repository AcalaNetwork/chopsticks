import { ApiPromise, WsProvider } from '@polkadot/api'
import { Codec } from '@polkadot/types/types'
import { HexString } from '@polkadot/util/types'
import { beforeAll, beforeEach, expect, vi } from 'vitest'

import { Api } from '@acala-network/chopsticks'
import { Blockchain } from '@acala-network/chopsticks/blockchain'
import { BuildBlockMode } from '@acala-network/chopsticks/blockchain/txpool'
import { GenesisProvider } from '@acala-network/chopsticks/genesis-provider'
import {
  InherentProviders,
  ParaInherentEnter,
  SetBabeRandomness,
  SetNimbusAuthorInherent,
  SetTimestamp,
  SetValidationData,
} from '@acala-network/chopsticks/blockchain/inherent'
import { StorageValues } from '@acala-network/chopsticks/utils/set-storage'
import { createServer } from '@acala-network/chopsticks/server'
import { defer } from '@acala-network/chopsticks/utils'
import { handler } from '@acala-network/chopsticks/rpc'

export { expectJson, expectHex, testingPairs } from '@acala-network/chopsticks-testing'

export type SetupOption = {
  endpoint?: string
  blockHash?: HexString
  mockSignatureHost?: boolean
  allowUnresolvedImports?: boolean
  genesis?: string
}

export const env = {
  acala: {
    endpoint: 'wss://acala-rpc-0.aca-api.network',
    // 3,800,000
    blockHash: '0x0df086f32a9c3399f7fa158d3d77a1790830bd309134c5853718141c969299c7' as HexString,
  },
  rococo: {
    endpoint: 'wss://rococo-rpc.polkadot.io',
    blockHash: '0xd7fef00504decd41d5d2e9a04346f6bc639fd428083e3ca941f636a8f88d456a' as HexString,
  },
  mandalaGenesis: {
    genesis:
      'https://raw.githubusercontent.com/AcalaNetwork/Acala/2c43dbbb380136f2c35bd0db08b286f346b71d61/resources/mandala-dist.json',
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
        registeredTypes: {},
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
          await delay(100)
          await close()
        },
      }
    },
    async teardownAll() {
      await delay(100)
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

    return res.teardownAll
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

export const matchSnapshot = (codec: CodecOrArray | Promise<CodecOrArray>) => {
  return expect(
    Promise.resolve(codec).then((x) => (Array.isArray(x) ? x.map((x) => x.toHuman()) : x.toHuman())),
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

export const mockCallback = () => {
  let next = defer()
  const callback = vi.fn((...args) => {
    next.resolve(args)
    next = defer()
  })

  return {
    callback,
    async next() {
      return next.promise
    },
  }
}

export const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export { defer }
