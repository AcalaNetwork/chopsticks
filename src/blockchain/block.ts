import { ApiPromise } from '@polkadot/api'
import { Header } from '@polkadot/types/interfaces'
import { stringToHex } from '@polkadot/util'

import { Blockchain } from '.'
import { RemoteStorageLayer, StorageLayer, StorageLayerProvider, StorageValueKind } from './storage-layer'
import { ResponseError } from '../rpc/shared'
import { TaskResponseCall } from '../task'

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
    this.#baseStorage = block?.storage ?? new RemoteStorageLayer(api, hash, chain.db)
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

  async storageDiff(): Promise<Record<string, string>> {
    const storage = {}

    for (const layer of this.#storages) {
      await layer.mergeInto(storage)
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
