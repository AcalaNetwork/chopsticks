import { stringToHex } from '@polkadot/util'
import _ from 'lodash'

import { Block } from './block'

type Callback = (block: Block, pairs: [string, string][]) => void | Promise<void>

export const randomId = () => Math.random().toString(36).substring(2)

export class HeadState {
  #headListeners: Record<string, (block: Block) => void> = {}
  #storageListeners: Record<string, [string[], Callback]> = {}
  #oldValues: Record<string, string | undefined> = {}

  #head: Block

  constructor(head: Block) {
    this.#head = head
  }

  subscribeHead(cb: (block: Block) => void) {
    const id = randomId()
    this.#headListeners[id] = cb
    return id
  }

  unsubscribeHead(id: string) {
    delete this.#headListeners[id]
  }

  async subscribeStorage(keys: string[], cb: Callback) {
    const id = randomId()
    this.#storageListeners[id] = [keys, cb]

    for (const key of keys) {
      this.#oldValues[key] = await this.#head.get(key)
    }

    return id
  }

  unsubscribeStorage(id: string) {
    delete this.#storageListeners[id]
  }

  async subscrubeRuntimeVersion(cb: (block: Block) => void) {
    const id = randomId()
    const codeKey = stringToHex(':code')
    this.#storageListeners[id] = [[codeKey], cb]
    this.#oldValues[codeKey] = await this.#head.get(codeKey)
    return id
  }

  unsubscribeRuntimeVersion(id: string) {
    delete this.#storageListeners[id]
  }

  async setHead(head: Block) {
    this.#head = head

    for (const cb of Object.values(this.#headListeners)) {
      cb(head)
    }

    const diff = await this.#head.storageDiff()

    for (const [keys, cb] of Object.values(this.#storageListeners)) {
      const changed = keys.filter((key) => diff[key]).map((key) => [key, diff[key]] as [string, string])
      if (changed.length > 0) {
        await cb(head, changed)
      }
    }

    Object.assign(this.#oldValues, diff)
  }
}
