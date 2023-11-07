import { Block } from '../block.js'
import { BuildBlockParams } from '../txpool.js'
import { GenericExtrinsic } from '@polkadot/types'
import { HexString } from '@polkadot/util/types'
import { getCurrentTimestamp, getSlotDuration } from '../../utils/time-travel.js'

export { SetValidationData } from './parachain/validation-data.js'
export { ParaInherentEnter } from './para-enter.js'
export { SetBabeRandomness } from './parachain/babe-randomness.js'
export { SetNimbusAuthorInherent } from './parachain/nimbus-author-inherent.js'

export interface CreateInherents {
  createInherents(parent: Block, params: BuildBlockParams): Promise<HexString[]>
}

export type InherentProvider = CreateInherents

export class SetTimestamp implements InherentProvider {
  async createInherents(parent: Block): Promise<HexString[]> {
    const meta = await parent.meta
    const slotDuration = await getSlotDuration(parent.chain)
    const currentTimestamp = await getCurrentTimestamp(parent.chain)
    return [new GenericExtrinsic(meta.registry, meta.tx.timestamp.set(currentTimestamp + BigInt(slotDuration))).toHex()]
  }
}

export class InherentProviders implements InherentProvider {
  readonly #base: InherentProvider
  readonly #providers: CreateInherents[]

  constructor(base: InherentProvider, providers: CreateInherents[]) {
    this.#base = base
    this.#providers = providers
  }

  async createInherents(parent: Block, params: BuildBlockParams): Promise<HexString[]> {
    const base = await this.#base.createInherents(parent, params)
    const extra = await Promise.all(this.#providers.map((provider) => provider.createInherents(parent, params)))
    return [...base, ...extra.flat()]
  }
}
