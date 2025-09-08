import type { HexString } from '@polkadot/util/types'
import _ from 'lodash'

import type { Api } from '../api.js'
import type { Database } from '../database.js'
import { defaultLogger } from '../logger.js'
import { CHILD_PREFIX_LENGTH, isPrefixedChildKey, PREFIX_LENGTH } from '../utils/index.js'
import KeyCache from '../utils/key-cache.js'

const logger = defaultLogger.child({ name: 'layer' })

const BATCH_SIZE = 1000

export enum StorageValueKind {
  Deleted = 'Deleted',
  DeletedPrefix = 'DeletedPrefix',
}

export type StorageValue = string | StorageValueKind | undefined

export interface StorageLayerProvider {
  /**
   * Returns true if key is deleted
   */
  deleted(key: string): boolean
  /**
   * Get the value of a storage key.
   */
  get(key: string, cache: boolean): Promise<StorageValue>
  /**
   * Get the value of many storage keys.
   */
  getMany(keys: string[], _cache: boolean): Promise<StorageValue[]>
  /**
   * Get paged storage keys.
   */
  getKeysPaged(prefix: string, pageSize: number, startKey: string): Promise<string[]>
  /**
   * Find next storage key.
   */
  findNextKey(prefix: string, startKey: string, knownBest?: string): Promise<string | undefined>
}

export class RemoteStorageLayer implements StorageLayerProvider {
  readonly #api: Api
  readonly #at: HexString
  readonly #db: Database | undefined
  readonly #keyCache = new KeyCache(PREFIX_LENGTH)
  readonly #defaultChildKeyCache = new KeyCache(CHILD_PREFIX_LENGTH)

  constructor(api: Api, at: HexString, db: Database | undefined) {
    this.#api = api
    this.#at = at
    this.#db = db
  }

  deleted(_key: string): boolean {
    return false
  }

  async get(key: string, _cache: boolean): Promise<StorageValue> {
    if (this.#db) {
      const res = await this.#db.queryStorage(this.#at as HexString, key as HexString)
      if (res) {
        return res.value ?? undefined
      }
    }
    logger.trace({ at: this.#at, key }, 'RemoteStorageLayer get')
    const data = await this.#api.getStorage(key, this.#at)
    this.#db?.saveStorage(this.#at as HexString, key as HexString, data)
    return data ?? undefined
  }

  async getMany(keys: string[], _cache: boolean): Promise<StorageValue[]> {
    const result: StorageValue[] = []
    let pending = keys.map((key, idx) => ({ key, idx }))

    if (this.#db) {
      const results = await Promise.all(
        pending.map(({ key }) => this.#db!.queryStorage(this.#at as HexString, key as HexString)),
      )

      const oldPending = pending
      pending = []
      results.forEach((res, idx) => {
        if (res) {
          result[idx] = res.value ?? undefined
        } else {
          pending.push({ key: oldPending[idx].key, idx })
        }
      })
    }

    if (pending.length) {
      logger.trace({ at: this.#at, keys }, 'RemoteStorageLayer getMany')
      const data = await this.#api.getStorageBatch(
        '0x',
        pending.map(({ key }) => key as HexString),
        this.#at,
      )
      data.forEach(([, res], idx) => {
        result[pending[idx].idx] = res ?? undefined
      })

      if (this.#db?.saveStorageBatch) {
        this.#db?.saveStorageBatch(data.map(([key, value]) => ({ key, value, blockHash: this.#at })))
      } else if (this.#db) {
        data.forEach(([key, value]) => this.#db?.saveStorage(this.#at, key, value))
      }
    }

    return result
  }

  async findNextKey(prefix: string, startKey: string, _knownBest?: string): Promise<string | undefined> {
    const keys = await this.getKeysPaged(prefix, 1, startKey)
    return keys[0]
  }

  async getKeysPaged(prefix: string, pageSize: number, startKey: string): Promise<string[]> {
    if (pageSize > BATCH_SIZE) throw new Error(`pageSize must be less or equal to ${BATCH_SIZE}`)
    logger.trace({ at: this.#at, prefix, pageSize, startKey }, 'RemoteStorageLayer getKeysPaged')

    const isChild = isPrefixedChildKey(prefix as HexString)
    const minPrefixLen = isChild ? CHILD_PREFIX_LENGTH : PREFIX_LENGTH

    // can't handle keyCache without prefix
    if (prefix === startKey || prefix.length < minPrefixLen || startKey.length < minPrefixLen) {
      return this.#api.getKeysPaged(prefix, pageSize, startKey, this.#at)
    }

    let batchComplete = false
    const keysPaged: string[] = []
    while (keysPaged.length < pageSize) {
      const nextKey = isChild
        ? await this.#defaultChildKeyCache.next(startKey as HexString)
        : await this.#keyCache.next(startKey as HexString)
      if (nextKey) {
        keysPaged.push(nextKey)
        startKey = nextKey
        continue
      }
      // batch fetch was completed
      if (batchComplete) {
        break
      }

      // fetch a batch of keys
      const batch = await this.#api.getKeysPaged(prefix, BATCH_SIZE, startKey, this.#at)
      batchComplete = batch.length < BATCH_SIZE

      // feed the key cache
      if (batch.length > 0) {
        if (isChild) {
          this.#defaultChildKeyCache.feed([startKey, ...batch] as HexString[])
        } else {
          this.#keyCache.feed([startKey, ...batch] as HexString[])
        }
      }

      if (batch.length === 0) {
        // no more keys were found
        break
      }

      if (this.#db) {
        // filter out keys that are not in the db]
        const newBatch: HexString[] = []

        for (const key of batch) {
          const res = await this.#db.queryStorage(this.#at, key)
          if (res) {
            continue
          }
          newBatch.push(key)
        }

        if (newBatch.length > 0) {
          // batch fetch storage values and save to db, they may be used later
          this.#api.getStorageBatch(prefix as HexString, newBatch, this.#at).then((storage) => {
            for (const [key, value] of storage) {
              this.#db?.saveStorage(this.#at, key, value)
            }
          })
        }
      }
    }
    return keysPaged
  }
}

export class StorageLayer implements StorageLayerProvider {
  readonly #store: Map<string, StorageValue | Promise<StorageValue>> = new Map()
  readonly #keys: string[] = []
  readonly #deletedPrefix: string[] = []
  #parent?: StorageLayerProvider

  constructor(parent?: StorageLayerProvider) {
    this.#parent = parent
  }

  #addKey(key: string) {
    const idx = _.sortedIndex(this.#keys, key)
    const key2 = this.#keys[idx]
    if (key === key2) {
      return
    }
    this.#keys.splice(idx, 0, key)
  }

  #removeKey(key: string) {
    const idx = _.sortedIndex(this.#keys, key)
    const key2 = this.#keys[idx]
    if (key === key2) {
      this.#keys.splice(idx, 1)
    }
  }

  deleted(key: string): boolean {
    if (this.#store.has(key)) {
      return this.#store.get(key) === StorageValueKind.Deleted
    }

    if (this.#deletedPrefix.some((dp) => key.startsWith(dp))) {
      return true
    }

    if (this.#parent) {
      return this.#parent.deleted(key)
    }

    return false
  }

  async get(key: string, cache: boolean): Promise<StorageValue | undefined> {
    if (this.#store.has(key)) {
      return this.#store.get(key)
    }

    if (this.#deletedPrefix.some((dp) => key.startsWith(dp))) {
      return StorageValueKind.Deleted
    }

    if (this.#parent) {
      const val = this.#parent.get(key, false)
      if (cache) {
        this.#store.set(key, val)
      }
      return val
    }

    return undefined
  }

  async getMany(keys: string[], cache: boolean): Promise<StorageValue[]> {
    const result: StorageValue[] = []
    const pending: Array<{ key: string; idx: number }> = []

    const preloadedPromises = keys.map(async (key, idx) => {
      if (this.#store.has(key)) {
        result[idx] = await this.#store.get(key)
      } else if (this.#deletedPrefix.some((dp) => key.startsWith(dp))) {
        result[idx] = StorageValueKind.Deleted
      } else {
        pending.push({ key, idx })
      }
    })

    if (pending.length && this.#parent) {
      const vals = await this.#parent.getMany(
        pending.map((p) => p.key),
        false,
      )
      vals.forEach((val, idx) => {
        if (cache) {
          this.#store.set(pending[idx].key, val)
        }
        result[pending[idx].idx] = val
      })
    }

    await Promise.all(preloadedPromises)
    return result
  }

  set(key: string, value: StorageValue): void {
    switch (value) {
      case StorageValueKind.Deleted:
        this.#store.set(key, StorageValueKind.Deleted)
        this.#removeKey(key)
        break
      case StorageValueKind.DeletedPrefix:
        this.#deletedPrefix.push(key)
        for (const k of this.#keys) {
          if (k.startsWith(key)) {
            this.#store.set(k, StorageValueKind.Deleted)
            this.#removeKey(k)
          }
        }
        break
      case undefined:
        this.#store.delete(key)
        this.#removeKey(key)
        break
      default:
        this.#store.set(key, value)
        this.#addKey(key)
        break
    }
  }

  setAll(values: Record<string, StorageValue | null> | [string, StorageValue | null][]) {
    if (!Array.isArray(values)) {
      values = Object.entries(values)
    }
    for (const [key, value] of values) {
      this.set(key, value || StorageValueKind.Deleted)
    }
  }

  async findNextKey(prefix: string, startKey: string, knownBest?: string): Promise<string | undefined> {
    const maybeBest = this.#keys.find((key) => key.startsWith(prefix) && key > startKey)
    if (!knownBest) {
      knownBest = maybeBest
    } else if (maybeBest && maybeBest < knownBest) {
      knownBest = maybeBest
    }
    if (this.#parent && !this.#deletedPrefix.some((dp) => dp === prefix)) {
      const parentBest = await this.#parent.findNextKey(prefix, startKey, knownBest)
      if (parentBest) {
        if (!maybeBest) {
          return parentBest
        }
        if (parentBest < maybeBest) {
          return parentBest
        }
      }
    }
    return knownBest
  }

  async getKeysPaged(prefix: string, pageSize: number, startKey: string): Promise<string[]> {
    if (!startKey || startKey === '0x') {
      startKey = prefix
    }

    const keys: string[] = []
    while (keys.length < pageSize) {
      const next = await this.findNextKey(prefix, startKey, undefined)
      if (!next) break
      startKey = next
      if (this.deleted(next)) continue
      keys.push(next)
    }
    return keys
  }

  /**
   * Merge the storage layer into the given object, can be used to get sotrage diff.
   */
  async mergeInto(into: Record<string, string | null>) {
    for (const [key, maybeValue] of this.#store) {
      const value = await maybeValue
      if (value === StorageValueKind.Deleted) {
        into[key] = null
      } else {
        into[key] = value as string
      }
    }
  }
}
