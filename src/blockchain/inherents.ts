import { ApiPromise } from '@polkadot/api'

import { Block } from './block'

export interface InherentProvider {
  createInherents(api: ApiPromise, parent: Block): Promise<string[]>
}

export class SetTimestamp implements InherentProvider {
  readonly #getTimestamp: () => number

  constructor(getTimestamp: () => number = Date.now) {
    this.#getTimestamp = getTimestamp
  }

  async createInherents(api: ApiPromise, _parent: Block): Promise<string[]> {
    return [api.tx.timestamp.set(this.#getTimestamp()).toHex()]
  }
}
