import { ApiPromise } from '@polkadot/api'
import { TaskManager } from '../task'

import { Block } from './block'

export interface CreateInherents {
  createInherents(api: ApiPromise, timestamp: number, parent: Block): Promise<string[]>
}

export interface InherentProvider extends CreateInherents {
  getTimestamp(): number
}

export class SetTimestamp implements InherentProvider {
  readonly #getTimestamp: () => number

  constructor(getTimestamp: () => number = Date.now) {
    this.#getTimestamp = getTimestamp
  }

  async createInherents(api: ApiPromise, timestamp: number, _parent: Block): Promise<string[]> {
    return [api.tx.timestamp.set(timestamp).toHex()]
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

  async createInherents(api: ApiPromise, timestamp: number, parent: Block): Promise<string[]> {
    const base = await this.#base.createInherents(api, timestamp, parent)
    const extra = await Promise.all(this.#providers.map((provider) => provider.createInherents(api, timestamp, parent)))
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

  async createInherents(api: ApiPromise, _timestamp: number, parent: Block): Promise<string[]> {
    if (!api.tx.parachainSystem?.setValidationData) {
      return []
    }
    void this.#tasks // TODO

    const parentBlock = await parent.parentBlock
    if (!parentBlock) {
      throw new Error('Parent block not found')
    }
    const extrinsics = await parentBlock.extrinsics
    const method = api.createType('GenericExtrinsic', extrinsics[this.#expectedIndex])
    const validationData = (method as any).args[0].toJSON()

    const newData = {
      ...validationData,
      validationData: {
        ...validationData.validationData,
        relayParentNumber: validationData.validationData.relayParentNumber + 2,
      },
    }

    const inherent = api.tx.parachainSystem.setValidationData(newData)

    return [inherent.toHex()]
  }
}
