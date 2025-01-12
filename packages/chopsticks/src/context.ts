import './utils/tunnel.js'
import {
  type BlockEntry,
  GenesisProvider,
  defaultLogger,
  isUrl,
  setup,
  timeTravel,
} from '@acala-network/chopsticks-core'
import { SqliteDatabase } from '@acala-network/chopsticks-db'
import type { HexString } from '@polkadot/util/types'
import axios from 'axios'
import { apiFetching } from './logger.js'
import type { Config } from './schema/index.js'
import { startFetchStorageWorker } from './utils/fetch-storages.js'
import { overrideStorage, overrideWasm } from './utils/override.js'

const logger = defaultLogger.child({ name: 'setup-context' })

export const genesisFromUrl = async (url: string) => {
  const getFile = async (url: string) => {
    if (isUrl(url)) {
      return axios.get(url).then((x) => x.data)
    }
    if (typeof process === 'object') {
      const { lstatSync, readFileSync } = await import('node:fs')
      if (lstatSync(url).isFile()) {
        return JSON.parse(String(readFileSync(url)))
      }
    }
    throw Error(`invalid genesis path or url ${url}`)
  }

  return new GenesisProvider(await getFile(url))
}

export const setupContext = async (argv: Config, overrideParent = false) => {
  const chainSpec = argv['chain-spec'] ?? argv.genesis
  let genesis: GenesisProvider | undefined
  if (chainSpec) {
    if (typeof chainSpec === 'string') {
      genesis = await genesisFromUrl(chainSpec)
    } else {
      genesis = new GenesisProvider(chainSpec)
    }
  }

  const chain = await setup({
    endpoint: argv.endpoint,
    block: argv.block,
    genesis,
    buildBlockMode: argv['build-block-mode'],
    db: argv.db ? new SqliteDatabase(argv.db) : undefined,
    mockSignatureHost: argv['mock-signature-host'],
    allowUnresolvedImports: argv['allow-unresolved-imports'],
    runtimeLogLevel: argv['runtime-log-level'],
    registeredTypes: argv['registered-types'],
    offchainWorker: argv['offchain-worker'],
    maxMemoryBlockCount: argv['max-memory-block-count'],
    processQueuedMessages: argv['process-queued-messages'],
    hooks: {
      apiFetching,
    },
  })

  // load block from db
  if (chain.db) {
    if (argv.resume) {
      let blockData: BlockEntry | null = null
      if (typeof argv.resume === 'string' && argv.resume.startsWith('0x')) {
        blockData = await chain.db.queryBlock(argv.resume as HexString)
      } else if (typeof argv.resume === 'number') {
        blockData = await chain.db.queryBlockByNumber(argv.resume)
      } else if (argv.resume === true) {
        blockData = await chain.db.queryHighestBlock()
      } else {
        throw new Error(`Resume failed. Invalid resume option ${argv.resume}`)
      }

      if (blockData) {
        const block = await chain.loadBlockFromDB(blockData.number)
        if (block) {
          await chain.setHead(block)
        }
        logger.info(`Resume from block ${blockData.number}, hash: ${blockData.hash}`)
      } else {
        throw new Error(`Resume failed. Cannot find block ${argv.resume}`)
      }
    }
  }

  if (argv.timestamp) await timeTravel(chain, argv.timestamp)

  let at: HexString | undefined
  if (overrideParent) {
    // in case of run block we need to apply wasm-override and import-storage to parent block
    const block = await chain.head.parentBlock
    if (!block) throw new Error('Cannot find parent block')
    at = block.hash
  }

  // override wasm before importing storage, in case new pallets have been
  // added that have storage imports
  await overrideWasm(chain, argv['wasm-override'], at)
  await overrideStorage(chain, argv['import-storage'], at)

  const fetchStorageWorker = await startFetchStorageWorker({
    config: argv['prefetch-storages'],
    dbPath: argv.db,
    block: argv.block,
    endpoint: argv.endpoint,
  })

  return { chain, fetchStorageWorker }
}
