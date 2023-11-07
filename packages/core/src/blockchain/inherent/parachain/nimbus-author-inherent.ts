import { GenericExtrinsic } from '@polkadot/types'
import { HexString } from '@polkadot/util/types'

import { Block } from '../../block.js'
import { BuildBlockParams } from '../../txpool.js'
import { CreateInherents } from '../index.js'

// Support for Nimbus Author Inherent
export class SetNimbusAuthorInherent implements CreateInherents {
  async createInherents(parent: Block, _params: BuildBlockParams): Promise<HexString[]> {
    const meta = await parent.meta
    if (!meta.tx.authorInherent?.kickOffAuthorshipValidation) {
      return []
    }
    return [new GenericExtrinsic(meta.registry, meta.tx.authorInherent.kickOffAuthorshipValidation()).toHex()]
  }
}
