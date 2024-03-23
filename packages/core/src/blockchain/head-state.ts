import { Block } from './block.js'
import { defaultLogger } from '../logger.js'

type Callback = (block: Block, pairs: [string, string | null][]) => void | Promise<void>

export const randomId = () => Math.random().toString(36).substring(2)

const logger = defaultLogger.child({ name: 'head-state' })

export class HeadState {
  #headListeners: Record<string, (block: Block) => void | Promise<void>> = {}
  #storageListeners: Record<string, [string[], Callback]> = {}
  #oldValues: Record<string, string | null> = {}

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
      this.#oldValues[key] = await this.#head.get(key).then((val) => val || null)
    }

    return id
  }

  unsubscribeStorage(id: string) {
    delete this.#storageListeners[id]
  }

  async setHead(head: Block) {
    this.#head = head

    for (const cb of Object.values(this.#headListeners)) {
      try {
        await cb(head)
      } catch (error) {
        logger.error(error, 'setHead head callback error')
      }
    }

    const diff = await this.#head.storageDiff()

    for (const [keys, cb] of Object.values(this.#storageListeners)) {
      const changed = keys.filter((key) => diff[key]).map((key) => [key, diff[key]] as [string, string | null])
      if (changed.length > 0) {
        try {
          await cb(head, changed)
        } catch (error) {
          logger.error(error, 'setHead storage diff callback error')
        }
      }
    }

    Object.assign(this.#oldValues, diff)
  }
}
