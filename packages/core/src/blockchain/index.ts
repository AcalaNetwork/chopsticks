import { ApplyExtrinsicResult, ChainProperties, Header } from '@polkadot/types/interfaces'
import { HexString } from '@polkadot/util/types'
import { Metadata, TypeRegistry } from '@polkadot/types'
import { RegisteredTypes } from '@polkadot/types/types'
import { blake2AsHex, xxhashAsHex } from '@polkadot/util-crypto'
import { getSpecExtensions, getSpecHasher, getSpecTypes } from '@polkadot/types-known/util'
import { objectSpread, u8aConcat, u8aToHex } from '@polkadot/util'
import _ from 'lodash'
import type { ExtDef } from '@polkadot/types/extrinsic/signedExtensions/types'
import type { TransactionValidity } from '@polkadot/types/interfaces/txqueue'

import { Api } from '../api.js'
import { Block } from './block.js'
import { BuildBlockMode, BuildBlockParams, DownwardMessage, HorizontalMessage, TxPool } from './txpool.js'
import { Database } from '../database.js'
import { HeadState } from './head-state.js'
import { InherentProvider } from './inherent/index.js'
import { OffchainWorker } from '../offchain.js'
import { RuntimeVersion } from '../wasm-executor/index.js'
import { StorageValue } from './storage-layer.js'
import { compactHex } from '../utils/index.js'
import { defaultLogger } from '../logger.js'
import { dryRunExtrinsic, dryRunInherents } from './block-builder.js'

const logger = defaultLogger.child({ name: 'blockchain' })

export interface Options {
  /** API instance, for getting on-chain data. */
  api: Api
  /** Build block mode. Default to Batch. */
  buildBlockMode?: BuildBlockMode
  /** Inherent provider, for creating inherents. */
  inherentProviders: InherentProvider[]
  /** Datasource for caching storage and blocks data. */
  db?: Database
  /** Used to create the initial head. */
  header: { number: number; hash: HexString }
  /** Whether to enable mock signature. Any signature starts with 0xdeadbeef and filled by 0xcd is considered valid */
  mockSignatureHost?: boolean
  /** Whether to allow wasm unresolved imports. */
  allowUnresolvedImports?: boolean
  /** Wasm runtime log level. */
  runtimeLogLevel?: number
  /** Polkadot.js custom types registration. */
  registeredTypes: RegisteredTypes
  /** Whether to enable offchain Worker. */
  offchainWorker?: boolean
  /** Max memory block count */
  maxMemoryBlockCount?: number
  /** Whether to process queued messages */
  processQueuedMessages?: boolean
}

/**
 * Local blockchain which provides access to blocks, txpool and methods
 * to manipulate the chain such as build blocks, submit extrinsics, xcm and more!
 *
 * @example
 *
 * ```ts
 * const chain = new Blockchain({
 *  api,
 *  buildBlockMode: BuildBlockMode.Manual,
 *  inherentProviders,
 *  header: {
 *    hash: blockHash,
 *    number: Number(header.number),
 *  },
 *  mockSignatureHost: true,
 *  allowUnresolvedImports: true,
 *  registeredTypes: {},
 * })
 * // build a block
 * chain.newBlock()
 * ```
 */
export class Blockchain {
  /** API instance, for getting on-chain data. */
  readonly api: Api
  /** Datasource for caching storage and blocks data. */
  readonly db: Database | undefined
  /** Enable mock signature. Any signature starts with 0xdeadbeef and filled by 0xcd is considered valid */
  readonly mockSignatureHost: boolean
  /** Allow wasm unresolved imports. */
  readonly allowUnresolvedImports: boolean
  #runtimeLogLevel: number
  /** Polkadot.js custom types registration. */
  readonly registeredTypes: RegisteredTypes

  readonly #txpool: TxPool
  readonly #inherentProviders: InherentProvider[]

  #head: Block
  readonly #blocksByNumber: Map<number, Block> = new Map()
  readonly #blocksByHash: Map<string, Block> = new Map()
  readonly #loadingBlocks: Record<string, Promise<void>> = {}

  /** For subscribing and managing the head state. */
  readonly headState: HeadState

  readonly offchainWorker: OffchainWorker | undefined
  readonly #maxMemoryBlockCount: number
  readonly processQueuedMessages: boolean = true

  // first arg is used as cache key
  readonly #registryBuilder = _.memoize(
    async (_cacheKey: string, metadata: HexString, version: RuntimeVersion): Promise<TypeRegistry> => {
      const chain = await this.api.chain
      const properties = await this.api.chainProperties

      const registry = new TypeRegistry()
      registry.setKnownTypes(this.registeredTypes)
      registry.setChainProperties(registry.createType('ChainProperties', properties) as ChainProperties)
      registry.register(getSpecTypes(registry, chain, version.specName, version.specVersion))
      registry.setHasher(getSpecHasher(registry, chain, version.specName))
      registry.setMetadata(
        new Metadata(registry, metadata),
        undefined,
        objectSpread<ExtDef>({}, getSpecExtensions(registry, chain, version.specName), this.api.signedExtensions),
        true,
      )
      return registry
    },
  )

  /**
   * @param options - Options for instantiating the blockchain
   */
  constructor({
    api,
    buildBlockMode,
    inherentProviders,
    db,
    header,
    mockSignatureHost = false,
    allowUnresolvedImports = false,
    runtimeLogLevel = 0,
    registeredTypes = {},
    offchainWorker = false,
    maxMemoryBlockCount = 500,
    processQueuedMessages = true,
  }: Options) {
    this.api = api
    this.db = db
    this.mockSignatureHost = mockSignatureHost
    this.allowUnresolvedImports = allowUnresolvedImports
    this.#runtimeLogLevel = runtimeLogLevel
    this.registeredTypes = registeredTypes

    this.#head = new Block(this, header.number, header.hash)
    this.#registerBlock(this.#head)

    this.#txpool = new TxPool(this, inherentProviders, buildBlockMode)
    this.#inherentProviders = inherentProviders

    this.headState = new HeadState(this.#head)

    if (offchainWorker) {
      this.offchainWorker = new OffchainWorker()
    }

    this.#maxMemoryBlockCount = maxMemoryBlockCount
    this.processQueuedMessages = processQueuedMessages
  }

  #registerBlock(block: Block) {
    // if exceed max memory block count, delete the oldest block
    if (this.#blocksByNumber.size === this.#maxMemoryBlockCount) {
      const { hash, number }: Block = this.#blocksByNumber.values().next().value
      this.#blocksByNumber.delete(number)
      this.#blocksByHash.delete(hash)
    }
    this.#blocksByNumber.set(block.number, block)
    this.#blocksByHash.set(block.hash, block)
  }

  get head(): Block {
    return this.#head
  }

  get txPool() {
    return this.#txpool
  }

  get runtimeLogLevel(): number {
    return this.#runtimeLogLevel
  }

  set runtimeLogLevel(level: number) {
    this.#runtimeLogLevel = level
    logger.debug(`Runtime log level set to ${logger.level}`)
  }

  async buildRegistry(metadata: HexString, version: RuntimeVersion) {
    const cacheKey = `${xxhashAsHex(metadata, 256)}-${version.specVersion}`
    return this.#registryBuilder(cacheKey, metadata, version)
  }

  async saveBlockToDB(block: Block) {
    if (this.db) {
      const { hash, number, header, extrinsics } = block
      // delete old ones with the same block number if any, keep the latest one
      await this.db.saveBlock({
        hash,
        number,
        header: (await header).toHex(),
        extrinsics: await extrinsics,
        parentHash: (await block.parentBlock)?.hash || null,
        storageDiff: await block.storageDiff(),
      })
    }
  }

  /**
   * Try to load block from db and register it.
   * If pass in number, get block by number, else get block by hash.
   */
  async loadBlockFromDB(hashOrNumber: number | HexString): Promise<Block | undefined> {
    if (this.db) {
      const blockData =
        typeof hashOrNumber === 'number'
          ? await this.db.queryBlockByNumber(hashOrNumber)
          : await this.db.queryBlock(hashOrNumber)
      if (blockData) {
        const { hash, number, header, extrinsics } = blockData
        const parentHash = blockData.parentHash || undefined
        let parentBlock = parentHash ? this.#blocksByHash.get(parentHash) : undefined
        if (!parentBlock) {
          parentBlock = await this.getBlock(parentHash)
        }
        const storageDiff = blockData.storageDiff ?? undefined
        const registry = await this.head.registry
        const block = new Block(this, number, hash, parentBlock, {
          header: registry.createType<Header>('Header', header),
          extrinsics,
          storage: parentBlock?.storage,
          storageDiff,
        })
        this.#registerBlock(block)
        return block
      }
    }
    return undefined
  }

  /**
   * Get block by number.
   */
  async getBlockAt(number?: number | null): Promise<Block | undefined> {
    if (number === null || number === undefined) {
      return this.head
    }
    if (number > this.#head.number) {
      return undefined
    }
    if (!this.#blocksByNumber.has(number)) {
      const blockFromDB = await this.loadBlockFromDB(number)
      if (blockFromDB) {
        return blockFromDB
      }
      const hash = await this.api.getBlockHash(number)
      if (!hash) {
        return undefined
      }
      const block = new Block(this, number, hash)
      this.#registerBlock(block)
    }
    return this.#blocksByNumber.get(number)
  }

  /**
   * Get block by hash.
   */
  async getBlock(hash?: HexString): Promise<Block | undefined> {
    await this.api.isReady
    if (hash == null) {
      hash = this.head.hash
    }
    if (!this.#blocksByHash.has(hash)) {
      const loadingBlock = this.#loadingBlocks[hash]
      if (loadingBlock) {
        await loadingBlock
      } else {
        const loadingBlock = (async () => {
          try {
            const blockFromDB = await this.loadBlockFromDB(hash)
            if (!blockFromDB) {
              const header = await this.api.getHeader(hash)
              if (!header) {
                throw new Error(`Block ${hash} not found`)
              }
              const block = new Block(this, Number(header.number), hash)
              this.#registerBlock(block)
            }
          } catch (e) {
            logger.debug(`getBlock(${hash}) failed: ${e}`)
          }
        })()
        this.#loadingBlocks[hash] = loadingBlock
        await loadingBlock
        delete this.#loadingBlocks[hash]
      }
    }
    return this.#blocksByHash.get(hash)
  }

  /**
   * Get all blocks in memory.
   */
  blocksInMemory(): Block[] {
    return Array.from(this.#blocksByNumber.values())
  }

  /**
   * Remove block from memory and db.
   */
  async unregisterBlock(block: Block) {
    if (block.hash === this.head.hash) {
      throw new Error('Cannot unregister head block')
    }
    if (this.#blocksByNumber.get(block.number)?.hash === block.hash) {
      this.#blocksByNumber.delete(block.number)
    }
    this.#blocksByHash.delete(block.hash)
    // delete from db
    if (this.db) {
      await this.db.deleteBlock(block.hash)
    }
  }

  async onNewBlock(block: Block): Promise<void> {
    await this.setHead(block)
    await this.saveBlockToDB(block)
  }

  /**
   * Set block as head.
   */
  async setHead(block: Block): Promise<void> {
    logger.debug(
      {
        number: block.number,
        hash: block.hash,
      },
      'setHead',
    )
    this.#head = block
    this.#registerBlock(block)
    await this.headState.setHead(block)

    if (this.offchainWorker) {
      await this.offchainWorker.run(block)
    }
  }

  /**
   * Submit extrinsic to txpool.
   */
  async submitExtrinsic(extrinsic: HexString): Promise<HexString> {
    const validity = await this.validateExtrinsic(extrinsic)
    if (validity.isOk) {
      await this.#txpool.submitExtrinsic(extrinsic)
      return blake2AsHex(extrinsic, 256)
    }
    throw validity.asErr
  }

  /**
   * Validate extrinsic by calling `TaggedTransactionQueue_validate_transaction`.
   */
  async validateExtrinsic(
    extrinsic: HexString,
    source: '0x00' | '0x01' | '0x02' = '0x02' /** External */,
  ): Promise<TransactionValidity> {
    const args = u8aToHex(u8aConcat(source, extrinsic, this.head.hash))
    const res = await this.head.call('TaggedTransactionQueue_validate_transaction', [args])
    const registry = await this.head.registry
    return registry.createType<TransactionValidity>('TransactionValidity', res.result)
  }

  submitUpwardMessages(id: number, ump: HexString[]) {
    this.#txpool.submitUpwardMessages(id, ump)

    logger.debug({ id, ump }, 'submitUpwardMessages')
  }

  submitDownwardMessages(dmp: DownwardMessage[]) {
    this.#txpool.submitDownwardMessages(dmp)

    logger.debug({ dmp }, 'submitDownwardMessages')
  }

  submitHorizontalMessages(id: number, hrmp: HorizontalMessage[]) {
    this.#txpool.submitHorizontalMessages(id, hrmp)

    logger.debug({ id, hrmp }, 'submitHorizontalMessages')
  }

  /**
   * Build a new block with optional params. Use this when you don't have all the {@link BuildBlockParams}
   */
  async newBlock(params?: Partial<BuildBlockParams>): Promise<Block> {
    await this.#txpool.buildBlock(params)
    return this.#head
  }

  /**
   * Build a new block with {@link BuildBlockParams}.
   */
  async newBlockWithParams(params: BuildBlockParams): Promise<Block> {
    await this.#txpool.buildBlockWithParams(params)
    return this.#head
  }

  /**
   * Get the upcoming blocks.
   */
  async upcomingBlocks() {
    return this.#txpool.upcomingBlocks()
  }

  /**
   * Dry run extrinsic in block `at`.
   */
  async dryRunExtrinsic(
    extrinsic: HexString | { call: HexString; address: string },
    at?: HexString,
  ): Promise<{ outcome: ApplyExtrinsicResult; storageDiff: [HexString, HexString | null][] }> {
    await this.api.isReady
    const head = at ? await this.getBlock(at) : this.head
    if (!head) {
      throw new Error(`Cannot find block ${at}`)
    }
    const registry = await head.registry
    const params = {
      transactions: [],
      downwardMessages: [],
      upwardMessages: [],
      horizontalMessages: {},
    }
    const { result, storageDiff } = await dryRunExtrinsic(head, this.#inherentProviders, extrinsic, params)
    const outcome = registry.createType<ApplyExtrinsicResult>('ApplyExtrinsicResult', result)
    return { outcome, storageDiff }
  }

  /**
   * Dry run hrmp messages in block `at`.
   * Return the storage diff.
   */
  async dryRunHrmp(
    hrmp: Record<number, HorizontalMessage[]>,
    at?: HexString,
  ): Promise<[HexString, HexString | null][]> {
    await this.api.isReady
    const head = at ? await this.getBlock(at) : this.head
    if (!head) {
      throw new Error(`Cannot find block ${at}`)
    }
    const params = {
      transactions: [],
      downwardMessages: [],
      upwardMessages: [],
      horizontalMessages: hrmp,
    }
    return dryRunInherents(head, this.#inherentProviders, params)
  }

  /**
   * Dry run dmp messages in block `at`.
   * Return the storage diff.
   */
  async dryRunDmp(dmp: DownwardMessage[], at?: HexString): Promise<[HexString, HexString | null][]> {
    await this.api.isReady
    const head = at ? await this.getBlock(at) : this.head
    if (!head) {
      throw new Error(`Cannot find block ${at}`)
    }
    const params = {
      transactions: [],
      downwardMessages: dmp,
      upwardMessages: [],
      horizontalMessages: {},
    }
    return dryRunInherents(head, this.#inherentProviders, params)
  }

  /**
   * Dry run ump messages in block `at`.
   * Return the storage diff.
   */
  async dryRunUmp(ump: Record<number, HexString[]>, at?: HexString): Promise<[HexString, HexString | null][]> {
    await this.api.isReady
    const head = at ? await this.getBlock(at) : this.head
    if (!head) {
      throw new Error(`Cannot find block ${at}`)
    }
    const meta = await head.meta

    const needsDispatch = meta.registry.createType('Vec<u32>', Object.keys(ump))

    const storageValues: [string, StorageValue | null][] = [
      [compactHex(meta.query.ump.needsDispatch()), needsDispatch.toHex()],
    ]

    for (const [paraId, messages] of Object.entries(ump)) {
      const upwardMessages = meta.registry.createType('Vec<Bytes>', messages)
      if (upwardMessages.length === 0) throw new Error('No upward meesage')

      const queueSize = meta.registry.createType('(u32, u32)', [
        upwardMessages.length,
        upwardMessages.map((x) => x.byteLength).reduce((s, i) => s + i, 0),
      ])

      storageValues.push([compactHex(meta.query.ump.relayDispatchQueues(paraId)), upwardMessages.toHex()])
      storageValues.push([compactHex(meta.query.ump.relayDispatchQueueSize(paraId)), queueSize.toHex()])
    }

    head.pushStorageLayer().setAll(storageValues)
    const params = {
      transactions: [],
      downwardMessages: [],
      upwardMessages: [],
      horizontalMessages: {},
    }
    return dryRunInherents(head, this.#inherentProviders, params)
  }

  /**
   * Get inherents of head.
   */
  getInherents(): InherentProvider[] {
    return this.#inherentProviders
  }

  /**
   * Close the db and disconnect api.
   */
  async close() {
    await this.api.disconnect()
    await this.db?.close()
  }
}
