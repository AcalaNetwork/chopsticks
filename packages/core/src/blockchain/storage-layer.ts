import { DataSource } from 'typeorm'
import _ from 'lodash'

import { Api } from '../api'
import { KeyValuePair } from '../db/entities'
import { defaultLogger } from '../logger'
import { mergeKey } from '../utils'
import KeyCache from '../utils/key-cache'

const logger = defaultLogger.child({ name: 'layer' })

const BATCH_SIZE = 1000

export const enum StorageValueKind {
  Deleted = 'Deleted',
  DeletedPrefix = 'DeletedPrefix',
}

export type StorageValue = string | StorageValueKind | undefined

export interface StorageLayerProvider {
  get(key: string, cache: boolean, child?: string): Promise<StorageValue>
  foldInto(into: StorageLayer): Promise<StorageLayerProvider | undefined>
  fold(): Promise<void>

  getKeysPaged(prefix: string, pageSize: number, startKey: string, child?: string): Promise<string[]>
}

export class RemoteStorageLayer implements StorageLayerProvider {
  readonly #api: Api
  readonly #at: string
  readonly #db: DataSource | undefined
  readonly #keyCache = new KeyCache()

  constructor(api: Api, at: string, db: DataSource | undefined) {
    this.#api = api
    this.#at = at
    this.#db = db
  }

  async get(key: string, _cache: boolean, child?: string): Promise<StorageValue> {
    const storageKey = mergeKey(child, key)
    const keyValuePair = this.#db?.getRepository(KeyValuePair)
    if (this.#db) {
      const res = await keyValuePair?.findOne({ where: { key: storageKey, blockHash: this.#at } })
      if (res) {
        return res.value ?? undefined
      }
    }
    logger.trace({ at: this.#at, key, child }, 'RemoteStorageLayer get')
    const data = child
      ? await this.#api.getChildStorage(child, key, this.#at)
      : await this.#api.getStorage(key, this.#at)
    keyValuePair?.upsert({ key: storageKey, blockHash: this.#at, value: data }, ['key', 'blockHash'])
    return data ?? undefined
  }

  async foldInto(_into: StorageLayer): Promise<StorageLayerProvider> {
    return this
  }
  async fold(): Promise<void> {}

  async getKeysPaged(prefix: string, pageSize: number, startKey: string, child?: string): Promise<string[]> {
    if (pageSize > BATCH_SIZE) throw new Error(`pageSize must be less or equal to ${BATCH_SIZE}`)
    logger.trace({ at: this.#at, prefix, pageSize, startKey, child }, 'RemoteStorageLayer getKeysPaged')
    // can't handle keyCache without prefix
    // can't handle keyCache for child keys
    // TODO: cache child keys
    if (prefix.length < 66 || !!child) {
      return child
        ? this.#api.getChildKeysPaged(child, prefix, pageSize, startKey, this.#at)
        : this.#api.getKeysPaged(prefix, pageSize, startKey, this.#at)
    }

    let batchComplete = false
    const keysPaged: string[] = []
    while (keysPaged.length < pageSize) {
      const nextKey = await this.#keyCache.next(startKey as any)
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
        this.#keyCache.feed([startKey, ...(batch as any)])
      }

      if (batch.length === 0) {
        // no more keys were found
        break
      }
    }
    return keysPaged
  }
}

export class StorageLayer implements StorageLayerProvider {
  readonly #store: Record<string, StorageValue | Promise<StorageValue>> = {}
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

  async get(key: string, cache: boolean, child?: string): Promise<StorageValue | undefined> {
    const storageKey = mergeKey(child, key)
    if (storageKey in this.#store) {
      return this.#store[storageKey]
    }

    if (this.#deletedPrefix.some((dp) => storageKey.startsWith(dp))) {
      return StorageValueKind.Deleted
    }

    if (this.#parent) {
      const val = this.#parent.get(key, false, child)
      if (cache) {
        this.#store[storageKey] = val
      }
      return val
    }

    return undefined
  }

  set(key: string, value: StorageValue): void {
    switch (value) {
      case StorageValueKind.Deleted:
        this.#store[key] = value
        this.#removeKey(key)
        break
      case StorageValueKind.DeletedPrefix:
        this.#deletedPrefix.push(key)
        for (const k of this.#keys) {
          if (k.startsWith(key)) {
            this.#store[k] = StorageValueKind.Deleted
            this.#removeKey(k)
          }
        }
        break
      case undefined:
        delete this.#store[key]
        this.#removeKey(key)
        break
      default:
        this.#store[key] = value
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

  async foldInto(into: StorageLayer): Promise<StorageLayerProvider | undefined> {
    const newParent = await this.#parent?.foldInto(into)

    for (const deletedPrefix of this.#deletedPrefix) {
      into.set(deletedPrefix, StorageValueKind.DeletedPrefix)
    }

    for (const key of this.#keys) {
      const value = await this.#store[key]
      into.set(key, value)
    }

    return newParent
  }

  async fold(): Promise<void> {
    if (this.#parent) {
      this.#parent = await this.#parent.foldInto(this)
    }
  }

  async getKeysPaged(prefix: string, pageSize: number, startKey: string, child?: string): Promise<string[]> {
    const storagePrefix = mergeKey(child, prefix)
    const storageStartKey = mergeKey(child, startKey)

    if (!this.#deletedPrefix.some((dp) => storageStartKey.startsWith(dp))) {
      const remote = (await this.#parent?.getKeysPaged(prefix, pageSize, startKey, child)) ?? []
      for (const key of remote) {
        if (this.#deletedPrefix.some((dp) => key.startsWith(dp))) {
          continue
        }
        this.#addKey(key)
      }
    }

    let idx = _.sortedIndex(this.#keys, storageStartKey)
    if (this.#keys[idx] === storageStartKey) {
      ++idx
    }
    const res: string[] = []
    while (res.length < pageSize) {
      const key: string = this.#keys[idx]
      if (!key || !key.startsWith(storagePrefix)) {
        break
      }
      res.push(key)
      ++idx
    }
    return res
  }

  async mergeInto(into: Record<string, string | null>) {
    for (const [key, maybeValue] of Object.entries(this.#store)) {
      const value = await maybeValue
      if (value === StorageValueKind.Deleted) {
        into[key] = null
      } else {
        into[key] = value as string
      }
    }
  }
}
