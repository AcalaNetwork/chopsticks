import { ApiPromise } from '@polkadot/api'
import { Header } from '@polkadot/types/interfaces'
import { stringToHex } from '@polkadot/util'
import _ from 'lodash'

import { Blockchain } from '.'
import { ResponseError } from '../rpc/shared'
import { TaskResponseCall } from '../task'
import { defaultLogger } from '../logger'

const logger = defaultLogger.child({ name: 'block' })

export const enum StorageValueKind {
  Deleted,
}

export type StorageValue = string | StorageValueKind | undefined

interface StorageLayerProvider {
  get(key: string, cache: boolean): Promise<StorageValue>
  foldInto(into: StorageLayer): Promise<StorageLayerProvider | undefined>
  fold(): Promise<void>

  getKeysPaged(prefix: string, pageSize: number, startKey: string): Promise<string[]>
}

class RemoveStorageLayer implements StorageLayerProvider {
  readonly #api: ApiPromise
  readonly #at: string

  constructor(api: ApiPromise, at: string) {
    this.#api = api
    this.#at = at
  }

  async get(key: string): Promise<StorageValue> {
    logger.trace({ at: this.#at, key }, 'RemoveStorageLayer get')
    const res = (await this.#api.rpc.state.getStorage(key, this.#at)) as any
    return res.toJSON()
  }

  async foldInto(_into: StorageLayer): Promise<StorageLayerProvider> {
    return this
  }
  async fold(): Promise<void> {}

  async getKeysPaged(prefix: string, pageSize: number, startKey: string): Promise<string[]> {
    logger.trace({ at: this.#at, prefix, pageSize, startKey }, 'RemoveStorageLayer getKeysPaged')
    const res = await this.#api.rpc.state.getKeysPaged(prefix, pageSize, startKey, this.#at)
    return res.map((x) => x.toHex())
  }
}

class StorageLayer implements StorageLayerProvider {
  readonly #store: Record<string, StorageValue | Promise<StorageValue>> = {}
  readonly #keys: string[] = []
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

    if (this.#parent) {
      const val = this.#parent.get(key, false)
      if (cache) {
        this.#store[key] = val
      }
      return val
    }

    return undefined
  }

  async set(key: string, value: StorageValue): Promise<void> {
    switch (value) {
      case StorageValueKind.Deleted:
        this.#store[key] = value
        this.#removeKey(key)
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

  async setAll(values: Record<string, StorageValue | null> | [string, StorageValue | null][]) {
    if (!Array.isArray(values)) {
      values = Object.entries(values)
    }
    for (const [key, value] of values) {
      await this.set(key, value || undefined)
    }
  }

  async foldInto(into: StorageLayer): Promise<StorageLayerProvider | undefined> {
    const newParent = await this.#parent?.foldInto(into)

    for (const key of this.#keys) {
      const value = await this.#store[key]
      this.#store[key] = value
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
    this.fold()
    // TODO: maintain a list of fetched ranges to avoid fetching the same range multiple times
    const remote = (await this.#parent?.getKeysPaged(prefix, pageSize, startKey)) ?? []
    for (const key of remote) {
      this.#addKey(key)
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

  mergeInto(into: Record<string, string>) {
    for (const key of this.#keys) {
      const value = this.#store[key]
      if (value === StorageValueKind.Deleted) {
        delete into[key]
      } else {
        into[key] = value as string
      }
    }
  }
}

export class Block {
  #api: ApiPromise
  #chain: Blockchain

  #header?: Header | Promise<Header>
  #parentBlock?: Block | Promise<Block | undefined>
  #extrinsics?: string[] | Promise<string[]>

  #wasm?: Promise<string>
  #runtimeVersion?: Promise<any>
  #metadata?: Promise<string>

  #baseStorage: StorageLayerProvider
  #storages: StorageLayer[]

  constructor(
    api: ApiPromise,
    chain: Blockchain,
    public readonly number: number,
    public readonly hash: string,
    parentBlock?: Block,
    block?: { header: Header; extrinsics: string[]; storage?: StorageLayerProvider }
  ) {
    this.#api = api
    this.#chain = chain
    this.#parentBlock = parentBlock
    this.#header = block?.header
    this.#extrinsics = block?.extrinsics
    this.#baseStorage = block?.storage ?? new RemoveStorageLayer(api, hash)
    this.#storages = []
  }

  get header(): Header | Promise<Header> {
    if (!this.#header) {
      this.#header = this.#api.rpc.chain.getHeader(this.hash)
    }
    return this.#header
  }

  get extrinsics(): string[] | Promise<string[]> {
    if (!this.#extrinsics) {
      this.#extrinsics = this.#api.rpc.chain.getBlock(this.hash).then((b) => b.block.extrinsics.map((e) => e.toHex()))
    }
    return this.#extrinsics
  }

  get parentBlock(): undefined | Block | Promise<Block | undefined> {
    if (this.number === 0) {
      return undefined
    }
    if (!this.#parentBlock) {
      this.#parentBlock = Promise.resolve(this.header).then((h) => this.#chain.getBlock(h.parentHash.toHex()))
    }
    return this.#parentBlock
  }

  get storage(): StorageLayerProvider {
    return this.#storages[this.#storages.length - 1] ?? this.#baseStorage
  }

  async get(key: string): Promise<string | undefined> {
    const val = await this.storage.get(key, true)
    switch (val) {
      case StorageValueKind.Deleted:
        return undefined
      default:
        return val
    }
  }

  async getKeysPaged(options: { prefix?: string; startKey?: string; pageSize: number }): Promise<string[]> {
    await this.storage.fold()

    const prefix = options.prefix ?? '0x'
    const startKey = options.startKey ?? prefix
    const pageSize = options.pageSize

    return this.storage.getKeysPaged(prefix, pageSize, startKey)
  }

  pushStorageLayer(): StorageLayer {
    const layer = new StorageLayer(this.storage)
    this.#storages.push(layer)
    return layer
  }

  popStorageLayer(): void {
    this.#storages.pop()
  }

  storageDiff(): Record<string, string> {
    const storage = {}

    for (const layer of this.#storages) {
      layer.mergeInto(storage)
    }

    return storage
  }

  get wasm(): Promise<string> {
    const getWasm = async () => {
      const wasmKey = stringToHex(':code')
      const wasm = await this.get(wasmKey)
      if (!wasm) {
        throw new Error('No wasm found')
      }
      return wasm
    }

    if (!this.#wasm) {
      this.#wasm = getWasm()
    }

    return this.#wasm
  }

  get runtimeVersion(): Promise<any> {
    if (!this.#runtimeVersion) {
      this.#runtimeVersion = new Promise((resolve, reject) => {
        this.wasm
          .then((wasm) => {
            this.#chain.tasks.addAndRunTask(
              {
                kind: 'RuntimeVersion',
                blockHash: this.hash,
                wasm,
              },
              (resp) => {
                if ('RuntimeVersion' in resp) {
                  const ver = resp.RuntimeVersion
                  const decoded = this.#api.createType('RuntimeVersion', ver)
                  resolve(decoded.toJSON())
                } else if ('Error' in resp) {
                  reject(new ResponseError(1, resp.Error))
                }
              }
            )
          })
          .catch(reject)
      })
    }

    return this.#runtimeVersion
  }

  get metadata(): Promise<string> {
    if (!this.#metadata) {
      this.#metadata = this.call('Metadata_metadata', '0x').then((x) => x.result)
    }
    return this.#metadata
  }

  async call(method: string, args: string): Promise<TaskResponseCall['Call']> {
    const wasm = await this.wasm
    const res = await new Promise<TaskResponseCall['Call']>((resolve, reject) => {
      this.#chain.tasks.addAndRunTask(
        {
          kind: 'Call',
          blockHash: this.hash,
          wasm,
          calls: [[method, args]],
        },
        (r) => {
          if ('Call' in r) {
            resolve(r.Call)
          } else if ('Error' in r) {
            reject(new ResponseError(1, r.Error))
          } else {
            reject(new ResponseError(1, 'Unexpected response'))
          }
        }
      )
    })
    return res
  }
}
