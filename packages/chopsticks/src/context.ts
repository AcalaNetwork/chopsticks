import './utils/tunnel'

import { Config } from './schema'
import { HexString } from '@polkadot/util/types'
import { importStorage, overrideWasm } from './utils/import-storage'
import { setup } from '@acala-network/chopsticks-core'

export const setupContext = async (argv: Config, overrideParent = false) => {
  const chain = await setup(argv)

  let at: HexString | undefined
  if (overrideParent) {
    // in case of run block we need to apply wasm-override and import-storage to parent block
    const block = await chain.head.parentBlock
    if (!block) throw new Error('Cannot find parent block')
    at = block.hash
  }

  // override wasm before importing storage, in case new pallets have been
  // added that have storage imports
  await importStorage(chain, argv['import-storage'], at)
  await overrideWasm(chain, argv['wasm-override'], at)

  return { chain }
}
