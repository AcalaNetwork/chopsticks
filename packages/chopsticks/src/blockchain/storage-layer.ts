import { DataSource } from 'typeorm'
import _ from 'lodash'

import { Api } from '../api'
import { defaultLogger } from '../logger'

const logger = defaultLogger.child({ name: 'layer' })

export const enum StorageValueKind {
  Deleted = 'Deleted',
  DeletedPrefix = 'DeletedPrefix',
}

export type StorageValue = string | StorageValueKind | undefined

export interface StorageLayerProvider {
  get(key: string, cache: boolean): Promise<StorageValue>
  foldInto(into: StorageLayer): Promise<StorageLayerProvider | undefined>
  fold(): Promise<void>

  getKeysPaged(prefix: string, pageSize: number, startKey: string): Promise<string[]>
}

export class RemoteStorageLayer implements StorageLayerProvider {
  readonly #api: Api
  readonly #at: string
  readonly #db: DataSource | undefined

  constructor(api: Api, at: string, db: DataSource | undefined) {
    this.#api = api
    this.#at = at
    this.#db = db
  }

  async get(key: string): Promise<StorageValue> {
    if (this.#db) {
      const res = await this.#db.getRepository('KeyValuePair').findOne({ where: { key, blockHash: this.#at } })
      if (res) {
        return res.value
      }
    }
    logger.trace({ at: this.#at, key }, 'RemoteStorageLayer get')
    const data = await this.#api.getStorage(key, this.#at)
    this.#db?.getRepository('KeyValuePair').upsert({ key, blockHash: this.#at, value: data }, ['key', 'blockHash'])
    return data
  }

  async foldInto(_into: StorageLayer): Promise<StorageLayerProvider> {
    return this
  }
  async fold(): Promise<void> {}

  async getKeysPaged(prefix: string, pageSize: number, startKey: string): Promise<string[]> {
    logger.trace({ at: this.#at, prefix, pageSize, startKey }, 'RemoteStorageLayer getKeysPaged')
    return this.#api.getKeysPaged(prefix, pageSize, startKey, this.#at)
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

  async get(key: string, cache: boolean): Promise<StorageValue | undefined> {
    if (key in this.#store) {
      return this.#store[key]
    }

    if (this.#deletedPrefix.some((prefix) => key.startsWith(prefix))) {
      return StorageValueKind.Deleted
    }

    if (this.#parent) {
      const val = this.#parent.get(key, false)
      if (cache) {
        this.#store[key] = val
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

  async getKeysPaged(prefix: string, pageSize: number, startKey: string): Promise<string[]> {
    if (!this.#deletedPrefix.some((prefix) => startKey.startsWith(prefix))) {
      // TODO: maintain a list of fetched ranges to avoid fetching the same range multiple times
      const remote = (await this.#parent?.getKeysPaged(prefix, pageSize, startKey)) ?? []
      for (const key of remote) {
        if (this.#deletedPrefix.some((prefix) => key.startsWith(prefix))) {
          continue
        }
        this.#addKey(key)
      }
    }

    let idx = _.sortedIndex(this.#keys, startKey)
    if (this.#keys[idx] === startKey) {
      ++idx
    }
    const res: string[] = []
    while (res.length < pageSize) {
      const key: string = this.#keys[idx]
      if (!key || !key.startsWith(prefix)) {
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
