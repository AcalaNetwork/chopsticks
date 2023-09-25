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
import { defaultLogger } from '../logger'
import { getRuntimeVersion, runTask, taskHandler } from '../executor'
import type { RuntimeVersion } from '../executor'

export type TaskCallResponse = {
  result: HexString
  storageDiff: [HexString, HexString | null][]
  offchainStorageDiff: [HexString, HexString | null][]
  runtimeLogs: string[]
}

/**
 * Block class.
 *
 * @example Instantiate a block
 *
 * ```ts
 * const block = new Block(chain, number, hash)
 * ```
 *
 * @example Get storage
 *
 * ```ts
 * const block = await chain.getBlock('0x...')
 * block.storage()
 * ```
 */
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
    /** Block number. */
    public readonly number: number,
    /** Block hash. */
    public readonly hash: HexString,
    /** Parent block. */
    parentBlock?: Block,
    block?: {
      /** See `@polkadot/types/interfaces` Header */
      header: Header
      /** Extrinsics */
      extrinsics: HexString[]
      /** Storage provider. Default to {@link RemoteStorageLayer} with {@link Blockchain.api chain.api} as remote. */
      storage?: StorageLayerProvider
      /** Storage diff to apply. */
      storageDiff?: Record<string, StorageValue | null>
    },
  ) {
    this.#chain = chain
    this.#parentBlock = parentBlock
    this.#header = block?.header
    this.#extrinsics = block?.extrinsics
    this.#baseStorage = block?.storage ?? new RemoteStorageLayer(chain.api, hash, chain.db)
    this.#storages = []

    const storageDiff = block?.storageDiff

    if (storageDiff) {
      // if code doesn't change then reuse parent block's meta
      if (!storageDiff?.[stringToHex(':code')]) {
        this.#runtimeVersion = parentBlock?.runtimeVersion
        this.#metadata = parentBlock?.metadata
        this.#registry = parentBlock?.registry
        this.#meta = parentBlock?.meta
      }

      this.pushStorageLayer().setAll(storageDiff)
    }
  }

  get chain(): Blockchain {
    return this.#chain
  }

  get header(): Header | Promise<Header> {
    if (!this.#header) {
      this.#header = Promise.all([this.registry, this.#chain.api.getHeader(this.hash)]).then(([registry, header]) =>
        registry.createType<Header>('Header', header),
      )
    }
    return this.#header
  }

  get extrinsics(): HexString[] | Promise<HexString[]> {
    if (!this.#extrinsics) {
      this.#extrinsics = this.#chain.api.getBlock(this.hash).then((b) => {
        if (!b) {
          throw new Error(`Block ${this.hash} not found`)
        }
        return b.block.extrinsics
      })
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

  /**
   * Get the block storage.
   */
  get storage(): StorageLayerProvider {
    return this.#storages[this.#storages.length - 1] ?? this.#baseStorage
  }

  /**
   * Get the block storage by key.
   */
  async get(key: string): Promise<string | undefined> {
    const val = await this.storage.get(key, true)
    switch (val) {
      case StorageValueKind.Deleted:
        return undefined
      default:
        return val
    }
  }

  /**
   * Get paged storage keys.
   */
  async getKeysPaged(options: { prefix?: string; startKey?: string; pageSize: number }): Promise<string[]> {
    const layer = new StorageLayer(this.storage)
    await layer.fold()

    const prefix = options.prefix ?? '0x'
    const startKey = options.startKey ?? '0x'
    const pageSize = options.pageSize

    return layer.getKeysPaged(prefix, pageSize, startKey)
  }

  /**
   * Push a layer to the storage stack.
   */
  pushStorageLayer(): StorageLayer {
    const layer = new StorageLayer(this.storage)
    this.#storages.push(layer)
    return layer
  }

  /**
   * Pop a layer from the storage stack.
   */
  popStorageLayer(): void {
    this.#storages.pop()
  }

  /**
   * Get storage diff.
   */
  async storageDiff(): Promise<Record<HexString, HexString | null>> {
    const storage = {}

    for (const layer of this.#storages) {
      await layer.mergeInto(storage)
    }

    return storage
  }

  /**
   * Get the wasm string.
   */
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

  /**
   * Set the runtime wasm.
   */
  setWasm(wasm: HexString): void {
    const wasmKey = stringToHex(':code')
    this.pushStorageLayer().set(wasmKey, wasm)
    this.#wasm = Promise.resolve(wasm)
    this.#runtimeVersion = undefined
    this.#registry = undefined
    this.#meta = undefined
    this.#metadata = undefined
  }

  /**
   * Get the type registry.
   * @see https://polkadot.js.org/docs/api/start/types.create#why-create-types
   */
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
            this.#chain.api.signedExtensions,
          ),
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
      this.#metadata = this.call('Metadata_metadata', []).then((resp) => compactHex(hexToU8a(resp.result)))
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

  /**
   * Call a runtime method.
   */
  async call(method: string, args: HexString[]): Promise<TaskCallResponse> {
    const wasm = await this.wasm
    const response = await runTask(
      {
        wasm,
        calls: [[method, args]],
        mockSignatureHost: this.#chain.mockSignatureHost,
        allowUnresolvedImports: this.#chain.allowUnresolvedImports,
        runtimeLogLevel: this.#chain.runtimeLogLevel,
      },
      taskHandler(this),
    )
    if (response.Call) {
      for (const log of response.Call.runtimeLogs) {
        defaultLogger.info(`RuntimeLogs:\n${log}`)
      }

      if (this.chain.offchainWorker) {
        // apply offchain storage
        for (const [key, value] of response.Call.offchainStorageDiff) {
          this.chain.offchainWorker.set(key, value)
        }
      }

      return response.Call
    }
    if (response.Error) throw Error(response.Error)
    throw Error('Unexpected response')
  }
}
