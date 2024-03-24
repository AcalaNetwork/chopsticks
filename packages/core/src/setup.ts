import '@polkadot/types-codec'
import { DigestItem } from '@polkadot/types/interfaces'
import { HexString } from '@polkadot/util/types'
import { HttpProvider, WsProvider } from '@polkadot/rpc-provider'
import { ProviderInterface } from '@polkadot/rpc-provider/types'
import { RegisteredTypes } from '@polkadot/types/types'
import { compactAddLength } from '@polkadot/util'

import { Api } from './api.js'
import { Blockchain } from './blockchain/index.js'
import { BuildBlockMode } from './blockchain/txpool.js'
import { Database } from './database.js'
import { GenesisProvider } from './genesis-provider.js'
import { defaultLogger } from './logger.js'
import { getSlotDuration, setStorage } from './index.js'
import { inherentProviders } from './blockchain/inherent/index.js'

export type SetupOptions = {
  endpoint?: string | string[]
  block?: string | number | null
  genesis?: GenesisProvider
  buildBlockMode?: BuildBlockMode
  db?: Database
  mockSignatureHost?: boolean
  allowUnresolvedImports?: boolean
  runtimeLogLevel?: number
  registeredTypes?: RegisteredTypes
  offchainWorker?: boolean
  maxMemoryBlockCount?: number
  processQueuedMessages?: boolean
}

export const genesisSetup = async (chain: Blockchain, genesis: GenesisProvider) => {
  const meta = await chain.head.meta
  const timestamp = Date.now()
  await setStorage(chain, {
    Timestamp: {
      Now: timestamp,
    },
  })

  const slotDuration = await getSlotDuration(chain)
  const currentSlot = Math.floor(timestamp / slotDuration)

  if (meta.consts.babe) {
    await setStorage(chain, {
      Babe: {
        CurrentSlot: currentSlot,
      },
    })

    genesis.genesisHeaderLogs = [
      '0x0642414245b50103020200001c5fef100000000044cadd14aaefbda13ac8d85e1a6d58be082e7e2f56a4f95a3c612c784aaa4063f5517bf67d93ce633cde2fde7fbcf8ddca80017aaf8cd48436514687c662f60eda0ffa2c4781906416f4e71a196c9783c60c1b83d54c3a29365d03706714570b',
    ]
  } else {
    await setStorage(chain, {
      Aura: {
        CurrentSlot: currentSlot,
      },
    })

    const newSlot = compactAddLength(meta.registry.createType('Slot', currentSlot + 1).toU8a())
    const consensusEngine = meta.registry.createType('ConsensusEngineId', 'aura')
    const digest = meta.registry.createType<DigestItem>('DigestItem', { PreRuntime: [consensusEngine, newSlot] })
    genesis.genesisHeaderLogs = [digest.toHex()]
  }

  await chain.newBlock()
}

export const processOptions = async (options: SetupOptions) => {
  defaultLogger.debug(options, 'Setup options')

  let provider: ProviderInterface
  if (options.genesis) {
    provider = options.genesis
  } else if (typeof options.endpoint === 'string' && /^(https|http):\/\//.test(options.endpoint || '')) {
    provider = new HttpProvider(options.endpoint)
  } else {
    provider = new WsProvider(options.endpoint, 3_000)
  }
  const api = new Api(provider)
  await api.isReady

  let blockHash: string
  if (options.block == null) {
    blockHash = await api.getBlockHash().then((hash) => {
      if (!hash) {
        // should not happen, but just in case
        throw new Error('Cannot find block hash')
      }
      return hash
    })
  } else if (typeof options.block === 'string' && options.block.startsWith('0x')) {
    blockHash = options.block as string
  } else if (Number.isInteger(+options.block)) {
    blockHash = await api.getBlockHash(Number(options.block)).then((hash) => {
      if (!hash) {
        throw new Error(`Cannot find block hash for ${options.block}`)
      }
      return hash
    })
  } else {
    throw new Error(`Invalid block number or hash: ${options.block}`)
  }

  defaultLogger.debug({ ...options, blockHash }, 'Args')

  return { ...options, blockHash, api }
}

export const setup = async (options: SetupOptions) => {
  const { api, blockHash, ...opts } = await processOptions(options)

  const header = await api.getHeader(blockHash)
  if (!header) {
    throw new Error(`Cannot find header for ${blockHash}`)
  }

  const chain = new Blockchain({
    api,
    buildBlockMode: opts.buildBlockMode,
    inherentProviders,
    db: opts.db,
    header: {
      hash: blockHash as HexString,
      number: Number(header.number),
    },
    mockSignatureHost: opts.mockSignatureHost,
    allowUnresolvedImports: opts.allowUnresolvedImports,
    runtimeLogLevel: opts.runtimeLogLevel,
    registeredTypes: opts.registeredTypes || {},
    offchainWorker: opts.offchainWorker,
    maxMemoryBlockCount: opts.maxMemoryBlockCount,
    processQueuedMessages: opts.processQueuedMessages,
  })

  if (opts.genesis) {
    await genesisSetup(chain, opts.genesis)
  }

  return chain
}
