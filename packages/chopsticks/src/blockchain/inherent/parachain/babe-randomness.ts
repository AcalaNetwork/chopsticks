import { GenericExtrinsic } from '@polkadot/types'
import { HexString } from '@polkadot/util/types'

import { Block } from '../../block'
import { BuildBlockParams } from '../../txpool'
import { CreateInherents } from '..'

// Support for Moonbeam pallet-randomness mandatory inherent
export class SetBabeRandomness implements CreateInherents {
  async createInherents(parent: Block, _params: BuildBlockParams): Promise<HexString[]> {
    const meta = await parent.meta
    if (!meta.tx.randomness?.setBabeRandomnessResults) {
      return []
    }
    return [new GenericExtrinsic(meta.registry, meta.tx.randomness.setBabeRandomnessResults()).toHex()]
  }
}
