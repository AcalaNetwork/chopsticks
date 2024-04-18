import { Block } from '../block.js'
import { BuildBlockParams } from '../txpool.js'
import { HexString } from '@polkadot/util/types'
import { ParaInherentEnter } from './para-enter.js'
import { SetBabeRandomness } from './parachain/babe-randomness.js'
import { SetNimbusAuthorInherent } from './parachain/nimbus-author-inherent.js'
import { SetTimestamp } from './timestamp.js'
import { SetValidationData } from './parachain/validation-data.js'

export interface InherentProvider {
  createInherents(newBlock: Block, params: BuildBlockParams): Promise<HexString[]>
}

export const inherentProviders = [
  new SetTimestamp(),
  new SetValidationData(),
  new ParaInherentEnter(),
  new SetNimbusAuthorInherent(),
  new SetBabeRandomness(),
]
