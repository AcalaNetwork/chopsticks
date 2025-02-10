import '@polkadot/types-codec'
import { HttpProvider, WsProvider } from '@polkadot/rpc-provider'
import type { ProviderInterface } from '@polkadot/rpc-provider/types'
import type { RegisteredTypes } from '@polkadot/types/types'
import type { HexString } from '@polkadot/util/types'

import { Api } from './api.js'
import { Blockchain } from './blockchain/index.js'
import { inherentProviders } from './blockchain/inherent/index.js'
import type { BuildBlockMode } from './blockchain/txpool.js'
import type { Database } from './database.js'
import type { GenesisProvider } from './genesis-provider.js'
import { defaultLogger } from './logger.js'

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
  hooks?: {
    apiFetching?: () => void
  }
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

  // setup api hooks
  api.onFetching(options.hooks?.apiFetching)

  await api.isReady

  let blockHash: string
  if (options.block == null) {
    blockHash = await api.getFinalizedHead().then((hash) => {
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
    // build 1st block
    await chain.newBlock()
  }

  return chain
}
