import '@polkadot/types-codec'
import { DataSource } from 'typeorm'
import { HexString } from '@polkadot/util/types'
import { ProviderInterface } from '@polkadot/rpc-provider/types'
import { RegisteredTypes } from '@polkadot/types/types'
import { WsProvider } from '@polkadot/api'

import { Api } from './api'
import { Blockchain } from './blockchain'
import { BuildBlockMode } from './blockchain/txpool'
import { Genesis } from './schema'
import { GenesisProvider } from './genesis-provider'
import {
  InherentProviders,
  ParaInherentEnter,
  SetBabeRandomness,
  SetNimbusAuthorInherent,
  SetTimestamp,
  SetValidationData,
} from './blockchain/inherent'
import { defaultLogger } from './logger'
import { getLogLevel } from './utils'
import { openDb } from './db'

type Options = {
  endpoint?: string
  block?: string | number | null
  genesis?: string | Genesis
  buildBlockMode?: BuildBlockMode
  db?: string
  mockSignatureHost?: boolean
  allowUnresolvedImports?: boolean
  runtimeLogLevel?: number
  registeredTypes?: RegisteredTypes
  offchainWorker?: boolean
  maxMemoryBlockCount?: number
}

export const setup = async (options: Options) => {
  defaultLogger.level = getLogLevel(options.runtimeLogLevel)
  defaultLogger.info(`Runtime log level set to ${defaultLogger.level}`)

  let provider: ProviderInterface
  if (options.genesis) {
    if (typeof options.genesis === 'string') {
      provider = await GenesisProvider.fromUrl(options.genesis)
    } else {
      provider = new GenesisProvider(options.genesis)
    }
  } else {
    provider = new WsProvider(options.endpoint)
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

  let db: DataSource | undefined
  if (options.db) {
    db = await openDb(options.db)
  }

  const header = await api.getHeader(blockHash)
  if (!header) {
    throw new Error(`Cannot find header for ${blockHash}`)
  }

  const inherents = new InherentProviders(new SetTimestamp(), [
    new SetValidationData(),
    new ParaInherentEnter(),
    new SetNimbusAuthorInherent(),
    new SetBabeRandomness(),
  ])

  return new Blockchain({
    api,
    buildBlockMode: options.buildBlockMode,
    inherentProvider: inherents,
    db,
    header: {
      hash: blockHash as HexString,
      number: Number(header.number),
    },
    mockSignatureHost: options.mockSignatureHost,
    allowUnresolvedImports: options.allowUnresolvedImports,
    runtimeLogLevel: options.runtimeLogLevel,
    registeredTypes: options.registeredTypes || {},
    offchainWorker: options.offchainWorker,
    maxMemoryBlockCount: options.maxMemoryBlockCount,
  })
}
