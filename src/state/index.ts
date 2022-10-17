import { WsProvider } from '@polkadot/rpc-provider'
import _ from 'lodash'

import { defaultLogger } from '../logger'

const logger = defaultLogger.child({ name: 'state' })

export default class State {
  // blockHash => key => value
  readonly #db: Record<string, Record<string, string | Promise<string>>> = {}
  readonly #wsProvider: WsProvider

  constructor(wsProvider: WsProvider) {
    this.#wsProvider = wsProvider
  }

  async get(blockHash: string, key: string): Promise<string | undefined> {
    logger.trace('Getting %s for block %s', key, blockHash)
    const local = _.get(this.#db, [blockHash, key])
    if (local) {
      return local
    }
    const remote = this.#wsProvider.send('state_getStorage', [key, blockHash])
    _.set(this.#db, [blockHash, key], remote)
    return remote
  }

  async set(blockHash: string, key: string, value: string): Promise<void> {
    logger.trace('Setting %s for block %s', key, blockHash)
    _.set(this.#db, [blockHash, key], value)
  }
}
