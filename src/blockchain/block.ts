import { ApiPromise } from '@polkadot/api'
import { Header } from '@polkadot/types/interfaces'
import { stringToHex } from '@polkadot/util'

import { Blockchain } from '.'

export const enum StorageValueKind {
  Deleted,
  Empty,
}

export type StorageValue = string | StorageValueKind

interface StorageLayerProvider {
  get(key: string, cache: boolean): Promise<StorageValue>
}

class RemoveStorageLayer implements StorageLayerProvider {
  readonly #api: ApiPromise
  readonly #at: string

  constructor(api: ApiPromise, at: string) {
    this.#api = api
    this.#at = at
  }

  async get(key: string): Promise<StorageValue> {
    const res = (await this.#api.rpc.state.getStorage(key, this.#at)) as any
    return res.toHex()
  }
}

class StorageLayer implements StorageLayerProvider {
  readonly #store: Record<string, StorageValue | Promise<StorageValue>> = {}
  readonly #parent?: StorageLayerProvider

  constructor(parent?: StorageLayerProvider) {
    this.#parent = parent
  }

  async get(key: string, cache: boolean): Promise<StorageValue> {
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

    return StorageValueKind.Empty
  }

  async set(key: string, value: StorageValue): Promise<void> {
    if (value === StorageValueKind.Empty) {
      delete this.#store[key]
    } else {
      this.#store[key] = value
    }
  }

  async setAll(values: Record<string, StorageValue>) {
    for (const [key, value] of Object.entries(values)) {
      await this.set(key, value)
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
  #metadata?: Promise<any>

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
      case StorageValueKind.Empty:
      case StorageValueKind.Deleted:
        return undefined
      default:
        return val
    }
  }

  pushStorageLayer(): StorageLayer {
    const layer = new StorageLayer(this.storage)
    this.#storages.push(layer)
    return layer
  }

  popStorageLayer(): void {
    this.#storages.pop()
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
                const ver = resp['RuntimeVersion']
                const decoded = this.#api.createType('RuntimeVersion', ver)
                resolve(decoded.toJSON())
              }
            )
          })
          .catch(reject)
      })
    }

    return this.#runtimeVersion
  }

  get metadata(): Promise<any> {
    if (!this.#metadata) {
      this.#metadata = new Promise((resolve, reject) => {
        this.wasm
          .then((wasm) => {
            this.#chain.tasks.addAndRunTask(
              {
                kind: 'Call',
                blockHash: this.hash,
                wasm,
                calls: [['Metadata_metadata', '0x']],
              },
              (resp) => {
                resolve(resp['Call'].result)
              }
            )
          })
          .catch(reject)
      })
    }
    return this.#metadata
  }
}
