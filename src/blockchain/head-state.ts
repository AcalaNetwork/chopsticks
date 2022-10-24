import _ from 'lodash'

import { Block } from './block'

export const randomId = () => Math.random().toString(36).substring(2)

export class HeadState {
  #headListeners: Record<string, (block: Block) => void> = {}
  #storageListeners: Record<string, [string[], (block: Block, pairs: [string, string][]) => void]> = {}
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

  async subscribeStorage(keys: string[], cb: (block: Block, pairs: [string, string][]) => void) {
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

  subscrubeRuntimeVersion(cb: (block: Block) => void) {
    // TODO: actually subscribe
    void cb
    return randomId()
  }

  unsubscribeRuntimeVersion(id: string) {
    // TODO: actually unsubscribe
    void id
  }

  setHead(head: Block) {
    this.#head = head

    for (const cb of Object.values(this.#headListeners)) {
      cb(head)
    }

    const diff = this.#head.storageDiff()

    for (const [keys, cb] of Object.values(this.#storageListeners)) {
      const changed = keys.filter((key) => diff[key]).map((key) => [key, diff[key]] as [string, string])
      if (changed.length > 0) {
        cb(head, changed)
      }
    }

    Object.assign(this.#oldValues, diff)
  }
}
