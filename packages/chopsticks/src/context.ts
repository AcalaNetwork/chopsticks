import './utils/tunnel'
import { BlockEntry, defaultLogger, setup, timeTravel } from '@acala-network/chopsticks-core'
import { Config } from './schema'
import { HexString } from '@polkadot/util/types'
import { SqliteDatabase } from '@acala-network/chopsticks-db'
import { overrideStorage, overrideWasm } from './utils/override'

const logger = defaultLogger.child({ name: 'setup-context' })

export const setupContext = async (argv: Config, overrideParent = false) => {
  const chain = await setup({
    endpoint: argv.endpoint,
    block: argv.block,
    genesis: argv.genesis,
    buildBlockMode: argv['build-block-mode'],
    db: argv.db ? new SqliteDatabase(argv.db) : undefined,
    mockSignatureHost: argv['mock-signature-host'],
    allowUnresolvedImports: argv['allow-unresolved-imports'],
    runtimeLogLevel: argv['runtime-log-level'],
    registeredTypes: argv['registered-types'],
    offchainWorker: argv['offchain-worker'],
    maxMemoryBlockCount: argv['max-memory-block-count'],
  })

  // load block from db
  if (chain.db) {
    if (argv.resume) {
      let blockData: BlockEntry | null = null

      switch (typeof argv.resume) {
        case 'string':
          blockData = await chain.db.queryBlock(argv.resume as HexString)
          break
        case 'number':
          blockData = await chain.db.queryBlockByNumber(argv.resume)
          break
        default:
          blockData = await chain.db.queryHighestBlock()
          break
      }
      if (blockData) {
        const block = await chain.loadBlockFromDB(blockData.number)
        block && (await chain.setHead(block))
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
  await overrideStorage(chain, argv['import-storage'], at)
  await overrideWasm(chain, argv['wasm-override'], at)

  return { chain }
}
