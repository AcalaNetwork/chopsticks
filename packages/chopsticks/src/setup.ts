import '@polkadot/types-codec'
import { DataSource } from 'typeorm'
import { HexString } from '@polkadot/util/types'
import { ProviderInterface } from '@polkadot/rpc-provider/types'
import { WsProvider } from '@polkadot/api'

import { Api } from './api'
import { Blockchain } from './blockchain'
import { Config } from './schema'
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
import { importStorage, overrideWasm } from './utils/import-storage'
import { openDb } from './db'
import { timeTravel } from './utils/time-travel'

export const setup = async (argv: Config) => {
  let provider: ProviderInterface
  if (argv.genesis) {
    if (typeof argv.genesis === 'string') {
      provider = await GenesisProvider.fromUrl(argv.genesis)
    } else {
      provider = new GenesisProvider(argv.genesis)
    }
  } else {
    provider = new WsProvider(argv.endpoint)
  }
  const api = new Api(provider)
  await api.isReady

  let blockHash: string
  if (argv.block == null) {
    blockHash = await api.getBlockHash()
  } else if (typeof argv.block === 'string' && argv.block.startsWith('0x')) {
    blockHash = argv.block as string
  } else if (Number.isInteger(+argv.block)) {
    blockHash = await api.getBlockHash(Number(argv.block))
  } else {
    throw new Error(`Invalid block number or hash: ${argv.block}`)
  }

  defaultLogger.debug({ ...argv, blockHash }, 'Args')

  let db: DataSource | undefined
  if (argv.db) {
    db = await openDb(argv.db)
  }

  const header = await api.getHeader(blockHash)

  const inherents = new InherentProviders(new SetTimestamp(), [
    new SetValidationData(),
    new ParaInherentEnter(),
    new SetNimbusAuthorInherent(),
    new SetBabeRandomness(),
  ])

  const chain = new Blockchain({
    api,
    buildBlockMode: argv['build-block-mode'],
    inherentProvider: inherents,
    db,
    header: {
      hash: blockHash as HexString,
      number: Number(header.number),
    },
    mockSignatureHost: argv['mock-signature-host'],
    allowUnresolvedImports: argv['allow-unresolved-imports'],
    registeredTypes: argv['registered-types'],
  })

  if (argv.timestamp) await timeTravel(chain, argv.timestamp)

  // override wasm before importing storage, in case new pallets have been
  // added that have storage imports
  await overrideWasm(chain, argv['wasm-override'])
  await importStorage(chain, argv['import-storage'])

  return { chain, api, ws: provider }
}
