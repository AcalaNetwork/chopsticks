import { Block } from '../block'
import { DecoratedMeta } from '@polkadot/types/metadata/decorate/types'
import { GenericExtrinsic } from '@polkadot/types'
import { HexString } from '@polkadot/util/types'

export { SetValidationData } from './parachain/validation-data'

export interface CreateInherents {
  createInherents(meta: DecoratedMeta, timestamp: number, parent: Block): Promise<HexString[]>
}

export interface InherentProvider extends CreateInherents {
  getTimestamp(blockNumber: number): number
}

export class SetTimestamp implements InherentProvider {
  readonly #getTimestamp: (blockNumber: number) => number

  constructor(getTimestamp: (blockNumber: number) => number = Date.now) {
    this.#getTimestamp = getTimestamp
  }

  async createInherents(meta: DecoratedMeta, timestamp: number, _parent: Block): Promise<HexString[]> {
    return [new GenericExtrinsic(meta.registry, meta.tx.timestamp.set(timestamp)).toHex()]
  }

  getTimestamp(blockNumber: number): number {
    return this.#getTimestamp(blockNumber)
  }
}

export class InherentProviders implements InherentProvider {
  readonly #base: InherentProvider
  readonly #providers: CreateInherents[]

  constructor(base: InherentProvider, providers: CreateInherents[]) {
    this.#base = base
    this.#providers = providers
  }

  async createInherents(meta: DecoratedMeta, timestamp: number, parent: Block): Promise<HexString[]> {
    const base = await this.#base.createInherents(meta, timestamp, parent)
    const extra = await Promise.all(
      this.#providers.map((provider) => provider.createInherents(meta, timestamp, parent))
    )
    return [...base, ...extra.flat()]
  }

  getTimestamp(blockNumber: number): number {
    return this.#base.getTimestamp(blockNumber)
  }
}
