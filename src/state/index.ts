import { ApiPromise } from '@polkadot/api'
import _ from 'lodash'

import { defaultLogger } from '../logger'

const logger = defaultLogger.child({ name: 'state' })

export default class State {
  // blockHash => key => value
  readonly #db: Record<string, Record<string, string | Promise<string>>> = {}
  readonly #api: ApiPromise

  #head: string

  constructor(api: ApiPromise, head: string) {
    this.#api = api
    this.#head = head
  }

  async get(blockHash: string, key: string): Promise<string | undefined> {
    logger.trace({ key, blockHash }, 'get')
    const local = _.get(this.#db, [blockHash, key])
    if (local) {
      return local
    }
    const remote = ((await this.#api.rpc.state.getStorage(key, blockHash)) as any).toHex()
    _.set(this.#db, [blockHash, key], remote)
    return remote
  }

  get head(): string {
    return this.#head
  }
}
