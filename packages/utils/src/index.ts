import { ApiPromise, WsProvider } from '@polkadot/api'
import {
  BuildBlockMode,
  StorageValues,
  connectParachains,
  connectVertical,
  defaultLogger,
  fetchConfig,
  setupWithServer,
} from '@acala-network/chopsticks'
import { Codec } from '@polkadot/types/types'
import { Config } from '@acala-network/chopsticks/schema/index.js'
import { HexString } from '@polkadot/util/types'
import { Keyring, createTestKeyring } from '@polkadot/keyring'
import { SubmittableExtrinsic } from '@polkadot/api-base/types'

const logger = defaultLogger.child({ name: 'utils' })

export * from './signFake.js'

export type SetupOption = {
  endpoint: string | string[]
  blockNumber?: number
  blockHash?: HexString
  wasmOverride?: string
  db?: string
  timeout?: number
  port?: number
  maxMemoryBlockCount?: number
  resume?: boolean | HexString | number
  runtimeLogLevel?: number
  allowUnresolvedImports?: boolean
  processQueuedMessages?: boolean
}

export type SetupConfig = Config & {
  timeout?: number
}

export const createConfig = ({
  endpoint,
  blockNumber,
  blockHash,
  wasmOverride,
  db,
  timeout,
  port,
  maxMemoryBlockCount,
  resume,
  runtimeLogLevel,
  allowUnresolvedImports,
  processQueuedMessages,
}: SetupOption): SetupConfig => {
  // random port if not specified
  port = port ?? Math.floor(Math.random() * 10000) + 10000
  const config = {
    endpoint,
    port,
    block: blockNumber || blockHash,
    'mock-signature-host': true,
    'build-block-mode': BuildBlockMode.Manual,
    'max-memory-block-count': maxMemoryBlockCount ?? 100,
    'runtime-log-level': runtimeLogLevel,
    db,
    'wasm-override': wasmOverride,
    timeout,
    resume: resume ?? false,
    'allow-unresolved-imports': allowUnresolvedImports,
    'process-queued-messages': processQueuedMessages,
  }
  return config
}

export const setupContext = async (option: SetupOption) => {
  return setupContextWithConfig(createConfig(option))
}

export const setupContextWithConfig = async ({ timeout, ...config }: SetupConfig) => {
  const { chain, listenPort, close } = await setupWithServer(config)

  const url = `ws://localhost:${listenPort}`
  const ws = new WsProvider(url, 3_000, undefined, timeout)
  const api = await ApiPromise.create({
    provider: ws,
    noInitWarn: true,
  })

  return {
    url,
    chain,
    ws,
    api,
    dev: {
      newBlock: (param?: { count?: number; to?: number; unsafeBlockHeight?: number }): Promise<string> => {
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
    },
    async teardown() {
      await api.disconnect()
      await close()
    },
    async pause() {
      await ws.send('dev_setBlockBuildMode', [BuildBlockMode.Instant])

      // log a bit later to ensure the message is visible
      setTimeout(() => console.log(`Test paused. Polkadot.js apps URL: https://polkadot.js.org/apps/?rpc=${url}`), 100)

      return new Promise((_resolve) => {}) // wait forever
    },
  }
}

export type NetworkContext = Awaited<ReturnType<typeof setupContext>>

export const setupNetworks = async (networkOptions: Partial<Record<string, Config | string | undefined>>) => {
  const ret = {} as Record<string, NetworkContext>

  let wasmOverriden = false

  for (const [name, options] of Object.entries(networkOptions) as [string, Config | string | undefined][]) {
    const config = typeof options === 'string' ? await fetchConfig(options) : options ?? (await fetchConfig(name))
    ret[name] = await setupContextWithConfig(config)
    wasmOverriden ||= config['wasm-override'] != null
  }

  const relaychainName = Object.keys(ret).filter((x) => ['polkadot', 'kusama'].includes(x.toLocaleLowerCase()))[0]
  const { [relaychainName]: relaychain, ...parachains } = ret

  if (relaychain) {
    for (const parachain of Object.values(parachains)) {
      await connectVertical(relaychain.chain, parachain.chain)
    }
  }

  const parachainList = Object.values(parachains).map((i) => i.chain)
  if (parachainList.length > 0) {
    await connectParachains(parachainList)
  }

  if (wasmOverriden) {
    // trigger runtime upgrade if needed (due to wasm override)
    for (const chain of Object.values(ret)) {
      await chain.dev.newBlock()
    }
    // handle xcm version message if needed (due to wasm override triggered xcm version upgrade)
    for (const chain of Object.values(ret)) {
      await chain.dev.newBlock()
    }
  }

  return ret
}

export function defer<T>() {
  const deferred = {} as { resolve: (value: any) => void; reject: (reason: any) => void; promise: Promise<T> }
  deferred.promise = new Promise((resolve, reject) => {
    deferred.resolve = resolve
    deferred.reject = reject
  })
  return deferred
}

export const sendTransaction = async (tx: Promise<SubmittableExtrinsic<'promise'>>) => {
  const signed = await tx
  const deferred = defer<Codec[]>()
  await signed.send((status) => {
    logger.debug('tranaction status: ', status.status.toHuman())
    if (status.isInBlock || status.isFinalized) {
      deferred.resolve(status.events)
    }
    if (status.isError) {
      deferred.reject(status.status)
    }
  })

  return {
    events: deferred.promise,
  }
}

export const testingPairs = (keyringType: 'ed25519' | 'sr25519' = 'ed25519', ss58Format?: number) => {
  const keyringEth = createTestKeyring({ type: 'ethereum' })
  // default to ed25519 because sr25519 signature is non-deterministic
  const keyring = new Keyring({ type: keyringType, ss58Format })
  return {
    alice: keyring.addFromUri('//Alice'),
    bob: keyring.addFromUri('//Bob'),
    charlie: keyring.addFromUri('//Charlie'),
    dave: keyring.addFromUri('//Dave'),
    eve: keyring.addFromUri('//Eve'),

    alith: keyringEth.getPair('0xf24FF3a9CF04c71Dbc94D0b566f7A27B94566cac'),
    baltathar: keyringEth.getPair('0x3Cd0A705a2DC65e5b1E1205896BaA2be8A07c6e0'),
    charleth: keyringEth.getPair('0x798d4Ba9baf0064Ec19eB4F0a1a45785ae9D6DFc'),
    dorothy: keyringEth.getPair('0x773539d4Ac0e786233D90A233654ccEE26a613D9'),
    ethan: keyringEth.getPair('0xFf64d3F6efE2317EE2807d223a0Bdc4c0c49dfDB'),

    keyring,
    keyringEth,
  }
}
