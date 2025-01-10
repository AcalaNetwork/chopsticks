import { GenericExtrinsic } from '@polkadot/types'
import type { HexString } from '@polkadot/util/types'

import type { Block } from '../../block.js'
import type { BuildBlockParams } from '../../txpool.js'
import type { InherentProvider } from '../index.js'

// Support for Moonbeam pallet-randomness mandatory inherent
export class SetBabeRandomness implements InherentProvider {
  async createInherents(newBlock: Block, _params: BuildBlockParams): Promise<HexString[]> {
    const parent = await newBlock.parentBlock
    if (!parent) throw new Error('parent block not found')

    const meta = await parent.meta
    if (!meta.tx.randomness?.setBabeRandomnessResults) {
      return []
    }
    return [new GenericExtrinsic(meta.registry, meta.tx.randomness.setBabeRandomnessResults()).toHex()]
  }
}
