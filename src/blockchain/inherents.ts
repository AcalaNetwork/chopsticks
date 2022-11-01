import { ApiPromise } from '@polkadot/api'

import { Block } from './block'

export interface InherentProvider {
  createInherents(api: ApiPromise, timestamp: number, parent: Block): Promise<string[]>
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
