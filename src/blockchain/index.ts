import { ApplyExtrinsicResult } from '@polkadot/types/interfaces'
import { DataSource } from 'typeorm'
import { HexString } from '@polkadot/util/types'
import { blake2AsHex } from '@polkadot/util-crypto'
import { u8aConcat, u8aToHex } from '@polkadot/util'
import type { TransactionValidity } from '@polkadot/types/interfaces/txqueue'
import { RegisteredTypes } from '@polkadot/types/types'

import { Api } from '../api'
import { Block } from './block'
import { BuildBlockMode, BuildBlockParams, HorizontalMessage, TxPool } from './txpool'
import { HeadState } from './head-state'
import { InherentProvider } from './inherent'
import { defaultLogger } from '../logger'
import { dryRunExtrinsic, dryRunInherents } from './block-builder'

const logger = defaultLogger.child({ name: 'blockchain' })

export interface Options {
  api: Api
  buildBlockMode?: BuildBlockMode
  inherentProvider: InherentProvider
  db?: DataSource
  header: { number: number; hash: HexString }
  mockSignatureHost?: boolean
  allowUnresolvedImports?: boolean
  registeredTypes: RegisteredTypes
}

export class Blockchain {
  readonly uid: string = Math.random().toString(36).substring(2)
  readonly api: Api
  readonly db: DataSource | undefined
  readonly mockSignatureHost: boolean
  readonly allowUnresolvedImports: boolean
  readonly registeredTypes: RegisteredTypes

  readonly #txpool: TxPool
  readonly #inherentProvider: InherentProvider

  #head: Block
  readonly #blocksByNumber: Block[] = []
  readonly #blocksByHash: Record<string, Block> = {}
  readonly #loadingBlocks: Record<string, Promise<void>> = {}

  readonly headState: HeadState

  constructor({
    api,
    buildBlockMode,
    inherentProvider,
    db,
    header,
    mockSignatureHost = false,
    allowUnresolvedImports = false,
    registeredTypes = {},
  }: Options) {
    this.api = api
    this.db = db
    this.mockSignatureHost = mockSignatureHost
    this.allowUnresolvedImports = allowUnresolvedImports
    this.registeredTypes = registeredTypes

    this.#head = new Block(this, header.number, header.hash)
    this.#registerBlock(this.#head)

    this.#txpool = new TxPool(this, inherentProvider, buildBlockMode)
    this.#inherentProvider = inherentProvider

    this.headState = new HeadState(this.#head)
  }

  #registerBlock(block: Block) {
    this.#blocksByNumber[block.number] = block
    this.#blocksByHash[block.hash] = block
  }

  get head(): Block {
    return this.#head
  }

  get pendingExtrinsics(): HexString[] {
    return this.#txpool.pendingExtrinsics
  }

  async getBlockAt(number?: number): Promise<Block | undefined> {
    if (number === undefined) {
      return this.head
    }
    if (number > this.#head.number) {
      return undefined
    }
    if (!this.#blocksByNumber[number]) {
      const hash = await this.api.getBlockHash(number)
      const block = new Block(this, number, hash)
      this.#registerBlock(block)
    }
    return this.#blocksByNumber[number]
  }

  async getBlock(hash?: HexString): Promise<Block | undefined> {
    await this.api.isReady
    if (hash == null) {
      hash = this.head.hash
    }
    if (!this.#blocksByHash[hash]) {
      const loadingBlock = this.#loadingBlocks[hash]
      if (loadingBlock) {
        await loadingBlock
      } else {
        const loadingBlock = (async () => {
          try {
            const header = await this.api.getHeader(hash)
            const block = new Block(this, Number(header.number), hash)
            this.#registerBlock(block)
          } catch (e) {
            logger.debug(`getBlock(${hash}) failed: ${e}`)
          }
        })()
        this.#loadingBlocks[hash] = loadingBlock
        await loadingBlock
        delete this.#loadingBlocks[hash]
      }
    }
    return this.#blocksByHash[hash]
  }

  unregisterBlock(block: Block): void {
    if (block.hash === this.head.hash) {
      throw new Error('Cannot unregister head block')
    }
    if (this.#blocksByNumber[block.number]?.hash === block.hash) {
      delete this.#blocksByNumber[block.number]
    }
    delete this.#blocksByHash[block.hash]
  }

  async setHead(block: Block): Promise<void> {
    logger.debug(
      {
        number: block.number,
        hash: block.hash,
      },
      'setHead'
    )
    this.#head = block
    this.#registerBlock(block)
    await this.headState.setHead(block)
  }

  async submitExtrinsic(extrinsic: HexString): Promise<HexString> {
    const source = '0x02' // External
    const args = u8aToHex(u8aConcat(source, extrinsic, this.head.hash))
    const res = await this.head.call('TaggedTransactionQueue_validate_transaction', args)
    const registry = await this.head.registry
    const validity: TransactionValidity = registry.createType('TransactionValidity', res.result)
    if (validity.isOk) {
      this.#txpool.submitExtrinsic(extrinsic)
      return blake2AsHex(extrinsic, 256)
    }
    throw new Error(`Extrinsic is invalid: ${validity.asErr.toString()}`)
  }

  async newBlock(params?: BuildBlockParams): Promise<Block> {
    await this.#txpool.buildBlock(params)
    return this.#head
  }

  async upcomingBlock(count = 1) {
    return this.#txpool.upcomingBlock(count)
  }

  async dryRunExtrinsic(
    extrinsic: HexString | { call: HexString; address: string },
    at?: HexString
  ): Promise<{ outcome: ApplyExtrinsicResult; storageDiff: [HexString, HexString | null][] }> {
    await this.api.isReady
    const head = at ? await this.getBlock(at) : this.head
    if (!head) {
      throw new Error(`Cannot find block ${at}`)
    }
    const registry = await head.registry
    const inherents = await this.#inherentProvider.createInherents(head)
    const { result, storageDiff } = await dryRunExtrinsic(head, inherents, extrinsic)
    const outcome = registry.createType<ApplyExtrinsicResult>('ApplyExtrinsicResult', result)
    return { outcome, storageDiff }
  }

  async dryRunHrmp(hrmp: Record<number, HorizontalMessage[]>): Promise<[HexString, HexString | null][]> {
    await this.api.isReady
    const head = this.head
    const inherents = await this.#inherentProvider.createInherents(head, { horizontalMessages: hrmp })
    return dryRunInherents(head, inherents)
  }
}
