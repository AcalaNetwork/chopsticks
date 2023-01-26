import { ChainProperties, Header } from '@polkadot/types/interfaces'
import { DecoratedMeta } from '@polkadot/types/metadata/decorate/types'
import { Metadata, TypeRegistry } from '@polkadot/types'
import { expandMetadata } from '@polkadot/types/metadata'
import { getSpecExtensions, getSpecHasher, getSpecTypes } from '@polkadot/types-known/util'
import { hexToU8a, objectSpread, stringToHex } from '@polkadot/util'
import type { ExtDef } from '@polkadot/types/extrinsic/signedExtensions/types'
import type { HexString } from '@polkadot/util/types'

import { Blockchain } from '.'
import { RemoteStorageLayer, StorageLayer, StorageLayerProvider, StorageValue, StorageValueKind } from './storage-layer'
import { compactHex } from '../utils'
import { getRuntimeVersion, runTask, taskHandler } from '../executor'
import type { RuntimeVersion } from '../executor'

export type TaskCallResponse = {
  result: HexString
  storageDiff: [HexString, HexString | null][]
}

export class Block {
  #chain: Blockchain

  #header?: Header | Promise<Header>
  #parentBlock?: Block | Promise<Block | undefined>
  #extrinsics?: HexString[] | Promise<HexString[]>

  #wasm?: Promise<HexString>
  #runtimeVersion?: Promise<RuntimeVersion>
  #metadata?: Promise<HexString>
  #registry?: Promise<TypeRegistry>
  #meta?: Promise<DecoratedMeta>

  #baseStorage: StorageLayerProvider
  #storages: StorageLayer[]

  constructor(
    chain: Blockchain,
    public readonly number: number,
    public readonly hash: HexString,
    parentBlock?: Block,
    block?: {
      header: Header
      extrinsics: HexString[]
      storage?: StorageLayerProvider
      storageDiff?: Record<string, StorageValue | null>
    }
  ) {
    this.#chain = chain
    this.#parentBlock = parentBlock
    this.#header = block?.header
    this.#extrinsics = block?.extrinsics
    this.#baseStorage = block?.storage ?? new RemoteStorageLayer(chain.api, hash, chain.db)
    this.#storages = []

    const storageDiff = block?.storageDiff || {}

    // if code doesn't change then reuse parent block's meta
    if (!storageDiff[stringToHex(':code')]) {
      this.#runtimeVersion = parentBlock?.runtimeVersion
      this.#metadata = parentBlock?.metadata
      this.#registry = parentBlock?.registry
      this.#meta = parentBlock?.meta
    }

    this.pushStorageLayer().setAll(storageDiff)
  }

  get chain(): Blockchain {
    return this.#chain
  }

  get header(): Header | Promise<Header> {
    if (!this.#header) {
      this.#header = Promise.all([this.registry, this.#chain.api.getHeader(this.hash)]).then(([registry, header]) =>
        registry.createType<Header>('Header', header)
      )
    }
    return this.#header
  }

  get extrinsics(): HexString[] | Promise<HexString[]> {
    if (!this.#extrinsics) {
      this.#extrinsics = this.#chain.api.getBlock(this.hash).then((b) => b.block.extrinsics)
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
    const layer = new StorageLayer(this.storage)
    await layer.fold()

    const prefix = options.prefix ?? '0x'
    const startKey = options.startKey ?? prefix
    const pageSize = options.pageSize

    return layer.getKeysPaged(prefix, pageSize, startKey)
  }

  pushStorageLayer(): StorageLayer {
    const layer = new StorageLayer(this.storage)
    this.#storages.push(layer)
    return layer
  }

  popStorageLayer(): void {
    this.#storages.pop()
  }

  async storageDiff(): Promise<Record<HexString, HexString | null>> {
    const storage = {}

    for (const layer of this.#storages) {
      await layer.mergeInto(storage)
    }

    return storage
  }

  get wasm() {
    if (!this.#wasm) {
      this.#wasm = (async (): Promise<HexString> => {
        const wasmKey = stringToHex(':code')
        const wasm = await this.get(wasmKey)
        if (!wasm) {
          throw new Error('No wasm found')
        }
        return wasm as HexString
      })()
    }

    return this.#wasm
  }

  setWasm(wasm: HexString): void {
    const wasmKey = stringToHex(':code')
    this.pushStorageLayer().set(wasmKey, wasm)
    this.#wasm = Promise.resolve(wasm)
    this.#runtimeVersion = undefined
    this.#registry = undefined
    this.#meta = undefined
    this.#metadata = undefined
  }

  get registry(): Promise<TypeRegistry> {
    if (!this.#registry) {
      this.#registry = Promise.all([
        this.metadata,
        this.#chain.api.chainProperties,
        this.#chain.api.chain,
        this.runtimeVersion,
      ]).then(([data, properties, chain, version]) => {
        const registry = new TypeRegistry(this.hash)
        registry.setKnownTypes(this.chain.registeredTypes)
        registry.setChainProperties(registry.createType('ChainProperties', properties) as ChainProperties)
        registry.register(getSpecTypes(registry, chain, version.specName, version.specVersion))
        registry.setHasher(getSpecHasher(registry, chain, version.specName))
        registry.setMetadata(
          new Metadata(registry, data),
          undefined,
          objectSpread<ExtDef>(
            {},
            getSpecExtensions(registry, chain, version.specName),
            this.#chain.api.signedExtensions
          )
        )
        return registry
      })
    }
    return this.#registry
  }

  get runtimeVersion(): Promise<RuntimeVersion> {
    if (!this.#runtimeVersion) {
      this.#runtimeVersion = this.wasm.then(getRuntimeVersion)
    }
    return this.#runtimeVersion
  }

  get metadata(): Promise<HexString> {
    if (!this.#metadata) {
      this.#metadata = this.call('Metadata_metadata', '0x').then((resp) => compactHex(hexToU8a(resp.result)))
    }
    return this.#metadata
  }

  get meta(): Promise<DecoratedMeta> {
    if (!this.#meta) {
      this.#meta = Promise.all([this.registry, this.metadata]).then(([registry, metadataStr]) => {
        const metadata = new Metadata(registry, metadataStr)
        return expandMetadata(registry, metadata)
      })
    }
    return this.#meta
  }

  async call(
    method: string,
    args: HexString,
    storage: [HexString, HexString | null][] = []
  ): Promise<TaskCallResponse> {
    const wasm = await this.wasm
    const response = await runTask(
      {
        wasm,
        calls: [[method, args]],
        storage,
        mockSignatureHost: this.#chain.mockSignatureHost,
        allowUnresolvedImports: this.#chain.allowUnresolvedImports,
      },
      taskHandler(this)
    )
    if (response.Call) return response.Call
    if (response.Error) throw Error(response.Error)
    throw Error('Unexpected response')
  }
}
