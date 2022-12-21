import { Block } from '../block'
import { GenericExtrinsic } from '@polkadot/types'
import { HexString } from '@polkadot/util/types'
import { compactHex } from '../../utils'
import { hexToU8a } from '@polkadot/util'

export { SetValidationData } from './parachain/validation-data'

export interface CreateInherents {
  createInherents(parent: Block): Promise<HexString[]>
}

export type InherentProvider = CreateInherents

export class SetTimestamp implements InherentProvider {
  async createInherents(parent: Block): Promise<HexString[]> {
    const meta = await parent.meta
    const timestampRaw = (await parent.get(compactHex(meta.query.timestamp.now()))) || '0x'
    const currentTimestamp = meta.registry.createType('u64', hexToU8a(timestampRaw)).toNumber()
    const period = meta.consts.babe
      ? (meta.consts.babe.expectedBlockTime.toJSON() as number)
      : (meta.consts.timestamp.minimumPeriod.toJSON() as number) * 2
    const newTimestamp = currentTimestamp + period
    return [new GenericExtrinsic(meta.registry, meta.tx.timestamp.set(newTimestamp)).toHex()]
  }
}

export class InherentProviders implements InherentProvider {
  readonly #base: InherentProvider
  readonly #providers: CreateInherents[]

  constructor(base: InherentProvider, providers: CreateInherents[]) {
    this.#base = base
    this.#providers = providers
  }

  async createInherents(parent: Block): Promise<HexString[]> {
    const base = await this.#base.createInherents(parent)
    const extra = await Promise.all(this.#providers.map((provider) => provider.createInherents(parent)))
    return [...base, ...extra.flat()]
  }
}
