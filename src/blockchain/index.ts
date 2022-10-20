import { ApiPromise } from '@polkadot/api'
import { Header } from '@polkadot/types/interfaces'
import { stringToHex } from '@polkadot/util'

export const enum StorageValueKind {
  Deleted,
  Empty,
}

export type StorageValue = string | StorageValueKind

interface StorageLayerProvider {
  get(key: string): Promise<StorageValue>
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

  async get(key: string): Promise<StorageValue> {
    if (key in this.#store) {
      return this.#store[key]
    }

    if (this.#parent) {
      const val = this.#parent.get(key)
      this.#store[key] = val
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
    const val = await this.storage.get(key)
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

  async #wasm(): Promise<string> {
    const wasmKey = stringToHex(':code')
    const wasm = await this.get(wasmKey)
    if (!wasm) {
      throw new Error('No wasm found')
    }
    return wasm
  }

  get wasm(): Promise<string> {
    return this.#wasm()
  }
}

export class Blockchain {
  #api: ApiPromise

  #head: Block
  #blocksByNumber: Block[] = []
  #blocksByHash: Record<string, Block> = {}

  constructor(api: ApiPromise, header: { number: number; hash: string }) {
    this.#api = api
    this.#head = new Block(api, this, header.number, header.hash)
  }

  #registerBlock(block: Block) {
    this.#blocksByNumber[block.number] = block
    this.#blocksByHash[block.hash] = block
  }

  get head(): Block {
    return this.#head
  }

  async getBlockAt(number: number): Promise<Block | undefined> {
    if (number > this.#head.number) {
      return undefined
    }
    if (!this.#blocksByNumber[number]) {
      const hash = await this.#api.rpc.chain.getBlockHash(number)
      const block = new Block(this.#api, this, number, hash.toHex())
      this.#registerBlock(block)
    }
    return this.#blocksByNumber[number]
  }

  async getBlock(hash: string): Promise<Block | undefined> {
    if (!this.#blocksByHash[hash]) {
      const header = await this.#api.rpc.chain.getHeader(hash)
      const block = new Block(this.#api, this, header.number.toNumber(), hash)
      this.#registerBlock(block)
    }
    return this.#blocksByHash[hash]
  }

  setHead(block: Block): void {
    this.#head = block
    this.#registerBlock(block)
  }
}
