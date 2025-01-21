import {
  BuildBlockMode,
  type StorageValues,
  connectParachains,
  connectVertical,
  defaultLogger,
  environment,
  fetchConfig,
  setupWithServer,
} from '@acala-network/chopsticks'
import type { NewBlockParams } from '@acala-network/chopsticks-core/rpc/dev/new-block.js'
import type { Config } from '@acala-network/chopsticks/schema/index.js'
import { ed25519CreateDerive, sr25519CreateDerive } from '@polkadot-labs/hdkd'
import { DEV_PHRASE, entropyToMiniSecret, mnemonicToEntropy } from '@polkadot-labs/hdkd-helpers'
import { ApiPromise, WsProvider } from '@polkadot/api'
import type { SubmittableExtrinsic } from '@polkadot/api-base/types'
import { Keyring, createTestKeyring } from '@polkadot/keyring'
import type { Codec } from '@polkadot/types/types'
import type { HexString } from '@polkadot/util/types'
import { getPolkadotSigner } from 'polkadot-api/signer'

const logger = defaultLogger.child({ name: 'utils' })

export * from './signFake.js'

/**
 * Configuration options for setting up a blockchain network instance
 */
export type SetupOption = {
  /** WebSocket endpoint(s) for connecting to the network */
  endpoint: string | string[]
  /** Specific block number to start from */
  blockNumber?: number
  /** Specific block hash to start from */
  blockHash?: HexString
  /** Path to override WASM runtime */
  wasmOverride?: string
  /** Path to database file */
  db?: string
  /** Connection timeout in milliseconds */
  timeout?: number
  /** Host address to bind the server to */
  host?: string
  /** Port number to bind the server to */
  port?: number
  /** Maximum number of blocks to keep in memory */
  maxMemoryBlockCount?: number
  /** Resume from a previous state (block hash or number) */
  resume?: boolean | HexString | number
  /** Runtime log level (0-5) */
  runtimeLogLevel?: number
  /** Allow unresolved imports in runtime */
  allowUnresolvedImports?: boolean
  /** Process queued XCM messages */
  processQueuedMessages?: boolean
}

/**
 * Extended configuration type that includes timeout
 */
export type SetupConfig = Config & {
  /** Connection timeout in milliseconds */
  timeout?: number
}

/**
 * Creates a configuration object from setup options
 * @param options - Setup options for the network
 * @returns Configuration object compatible with chopsticks
 */
export const createConfig = ({
  endpoint,
  blockNumber,
  blockHash,
  wasmOverride,
  db,
  timeout,
  host,
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
    host,
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

/**
 * Sets up a blockchain network context using provided options
 * @param option - Setup options for the network
 * @returns Network context including API, WebSocket provider, and utility functions
 */
export const setupContext = async (option: SetupOption) => {
  return setupContextWithConfig(createConfig(option))
}

/**
 * Sets up a blockchain network context using a configuration object
 * @param config - Configuration object for the network
 * @returns Network context including API, WebSocket provider, and utility functions
 */
export const setupContextWithConfig = async ({ timeout, ...config }: SetupConfig) => {
  const { chain, addr, close } = await setupWithServer(config)

  const url = `ws://${addr}`
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
      /** Creates a new block with optional parameters */
      newBlock: (param?: Partial<NewBlockParams>): Promise<string> => {
        return ws.send('dev_newBlock', [param])
      },
      /** Sets storage values at a specific block */
      setStorage: (values: StorageValues, blockHash?: string) => {
        return ws.send('dev_setStorage', [values, blockHash])
      },
      /** Moves blockchain time to a specific timestamp */
      timeTravel: (date: string | number) => {
        return ws.send<number>('dev_timeTravel', [date])
      },
      /** Sets the chain head to a specific block */
      setHead: (hashOrNumber: string | number) => {
        return ws.send('dev_setHead', [hashOrNumber])
      },
    },
    /** Cleans up resources and closes connections */
    async teardown() {
      await api.disconnect()
      await close()
    },
    /** Pauses execution and enables manual interaction through Polkadot.js apps */
    async pause() {
      await ws.send('dev_setBlockBuildMode', [BuildBlockMode.Instant])

      // log a bit later to ensure the message is visible
      setTimeout(() => console.log(`Test paused. Polkadot.js apps URL: https://polkadot.js.org/apps/?rpc=${url}`), 100)

      return new Promise((_resolve) => {}) // wait forever
    },
  }
}

/** Type alias for the network context returned by setupContext */
export type NetworkContext = Awaited<ReturnType<typeof setupContext>>

/**
 * Sets up multiple blockchain networks and establishes connections between them
 * @param networkOptions - Configuration options for each network
 * @returns Record of network contexts indexed by network name
 */
export const setupNetworks = async (networkOptions: Partial<Record<string, Config | string | undefined>>) => {
  const ret = {} as Record<string, NetworkContext>

  let wasmOverriden = false

  for (const [name, options] of Object.entries(networkOptions) as [string, Config | string | undefined][]) {
    const config = typeof options === 'string' ? await fetchConfig(options) : (options ?? (await fetchConfig(name)))
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
    await connectParachains(parachainList, environment.DISABLE_AUTO_HRMP)
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

/**
 * Creates a deferred promise that can be resolved or rejected from outside
 * @returns Object containing promise, resolve function, and reject function
 */
export function defer<T>() {
  const deferred = {} as { resolve: (value: any) => void; reject: (reason: any) => void; promise: Promise<T> }
  deferred.promise = new Promise((resolve, reject) => {
    deferred.resolve = resolve
    deferred.reject = reject
  })
  return deferred
}

/**
 * Sends a transaction and waits for it to be included in a block
 * @param tx - Promise of a submittable extrinsic
 * @returns Promise that resolves with transaction events
 */
export const sendTransaction = async (tx: Promise<SubmittableExtrinsic<'promise'>>) => {
  const signed = await tx
  const deferred = defer<Codec[]>()
  await signed.send((status) => {
    logger.debug({ status: status.status.toHuman() }, 'Transaction status')
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

/**
 * Creates a set of test keypairs for both ed25519/sr25519 and ethereum addresses
 * @param keyringType - Type of keyring to use for substrate addresses ('ed25519' or 'sr25519')
 * @param ss58Format - SS58 address format to use
 * @returns Object containing various test keypairs and keyring instances
 */
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

/**
 * Creates a set of test signers for either Ed25519 or Sr25519.
 * @param keyringType Type of keyring to use for substrate addresses ('ed25519' or 'sr25519')
 * @returns Object containing various test signers, and a `polkadotSignerBuilder` function to create more.
 */
export const testingSigners = (keyringType: 'Ed25519' | 'Sr25519' = 'Ed25519') => {
  const entropy = mnemonicToEntropy(DEV_PHRASE)
  const miniSecret = entropyToMiniSecret(entropy)
  const derive = keyringType === 'Ed25519' ? ed25519CreateDerive(miniSecret) : sr25519CreateDerive(miniSecret)

  // Create a PAPI polkadot signer given a derivation path e.g. "//Alice" or "//Bob".
  const polkadotSignerBuilder = (path: string, keyringType: 'Ed25519' | 'Sr25519' = 'Ed25519') => {
    const hdkdKeyPair = derive(path)
    return getPolkadotSigner(hdkdKeyPair.publicKey, keyringType, hdkdKeyPair.sign)
  }

  return {
    alice: polkadotSignerBuilder('//Alice', keyringType),
    bob: polkadotSignerBuilder('//Bob', keyringType),
    charlie: polkadotSignerBuilder('//Charlie', keyringType),
    dave: polkadotSignerBuilder('//Dave', keyringType),
    eve: polkadotSignerBuilder('//Eve', keyringType),
    ferdie: polkadotSignerBuilder('//Ferdie', keyringType),

    polkadotSignerBuilder,
  }
}
