import './utils/tunnel'
import { Config } from './schema'
import { HexString } from '@polkadot/util/types'
import { overrideStorage, overrideWasm } from './utils/override'
import { setup, timeTravel } from '@acala-network/chopsticks-core'

export const setupContext = async (argv: Config, overrideParent = false) => {
  const chain = await setup({
    endpoint: argv.endpoint,
    block: argv.block,
    genesis: argv.genesis,
    buildBlockMode: argv['build-block-mode'],
    db: argv.db,
    mockSignatureHost: argv['mock-signature-host'],
    allowUnresolvedImports: argv['allow-unresolved-imports'],
    runtimeLogLevel: argv['runtime-log-level'],
    registeredTypes: argv['registered-types'],
    offchainWorker: argv['offchain-worker'],
    maxMemoryBlockCount: argv['max-memory-block-count'],
  })

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
