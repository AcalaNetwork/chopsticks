import { GenericExtrinsic } from '@polkadot/types'
import { HexString } from '@polkadot/util/types'

import { Block } from '../../block.js'
import { BuildBlockParams } from '../../txpool.js'
import { InherentProvider } from '../index.js'

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
