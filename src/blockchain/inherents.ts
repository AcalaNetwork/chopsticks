import { Block } from './block'
import { DecoratedMeta } from '@polkadot/types/metadata/decorate/types'
import { GenericExtrinsic } from '@polkadot/types'
import { TaskManager } from '../task'

export interface CreateInherents {
  createInherents(meta: DecoratedMeta, timestamp: number, parent: Block): Promise<string[]>
}

export interface InherentProvider extends CreateInherents {
  getTimestamp(): number
}

export class SetTimestamp implements InherentProvider {
  readonly #getTimestamp: () => number

  constructor(getTimestamp: () => number = Date.now) {
    this.#getTimestamp = getTimestamp
  }

  async createInherents(meta: DecoratedMeta, timestamp: number, _parent: Block): Promise<string[]> {
    return [new GenericExtrinsic(meta.registry, meta.tx.timestamp.set(timestamp)).toHex()]
  }

  getTimestamp(): number {
    return this.#getTimestamp()
  }
}

export class InherentProviders implements InherentProvider {
  readonly #base: InherentProvider
  readonly #providers: CreateInherents[]

  constructor(base: InherentProvider, providers: CreateInherents[]) {
    this.#base = base
    this.#providers = providers
  }

  async createInherents(meta: DecoratedMeta, timestamp: number, parent: Block): Promise<string[]> {
    const base = await this.#base.createInherents(meta, timestamp, parent)
    const extra = await Promise.all(
      this.#providers.map((provider) => provider.createInherents(meta, timestamp, parent))
    )
    return [...base, ...extra.flat()]
  }

  getTimestamp(): number {
    return this.#base.getTimestamp()
  }
}

export class SetValidationData implements CreateInherents {
  readonly #tasks: TaskManager
  readonly #expectedIndex: number

  constructor(tasks: TaskManager, expectedIndex: number) {
    this.#tasks = tasks
    this.#expectedIndex = expectedIndex
  }

  async createInherents(meta: DecoratedMeta, _timestamp: number, parent: Block): Promise<string[]> {
    if (!meta.tx.parachainSystem?.setValidationData) {
      return []
    }
    void this.#tasks // TODO

    const parentBlock = await parent.parentBlock
    if (!parentBlock) {
      throw new Error('Parent block not found')
    }
    const extrinsics = await parentBlock.extrinsics
    const method = meta.registry.createType('GenericExtrinsic', extrinsics[this.#expectedIndex])
    const validationData = (method as any).args[0].toJSON()

    const newData = {
      ...validationData,
      validationData: {
        ...validationData.validationData,
        relayParentNumber: validationData.validationData.relayParentNumber + 2,
      },
    }

    const inherent = new GenericExtrinsic(meta.registry, meta.tx.parachainSystem.setValidationData(newData))

    return [inherent.toHex()]
  }
}
