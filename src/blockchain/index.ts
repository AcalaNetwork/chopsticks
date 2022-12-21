import { DataSource } from 'typeorm'
import { Header } from '@polkadot/types/interfaces'
import { HexString } from '@polkadot/util/types'
import { blake2AsHex } from '@polkadot/util-crypto'
import { u8aConcat, u8aToHex } from '@polkadot/util'
import type { TransactionValidity } from '@polkadot/types/interfaces/txqueue'

import { Api } from '../api'
import { Block } from './block'
import { BuildBlockMode, TxPool } from './txpool'
import { HeadState } from './head-state'
import { InherentProvider } from './inherent'
import { ResponseError } from '../rpc/shared'
import { defaultLogger } from '../logger'

const logger = defaultLogger.child({ name: 'blockchain' })

export interface Options {
  api: Api
  buildBlockMode?: BuildBlockMode
  inherentProvider: InherentProvider
  db?: DataSource
  header: { number: number; hash: string }
  mockSignatureHost?: boolean
  allowUnresolvedImports?: boolean
}

export class Blockchain {
  readonly api: Api
  readonly db: DataSource | undefined
  readonly mockSignatureHost: boolean
  readonly allowUnresolvedImports: boolean

  readonly #txpool: TxPool

  #head: Block
  readonly #blocksByNumber: Block[] = []
  readonly #blocksByHash: Record<string, Block> = {}

  readonly headState: HeadState

  constructor({
    api,
    buildBlockMode,
    inherentProvider,
    db,
    header,
    mockSignatureHost = false,
    allowUnresolvedImports = false,
  }: Options) {
    this.api = api
    this.db = db
    this.mockSignatureHost = mockSignatureHost
    this.allowUnresolvedImports = allowUnresolvedImports

    this.#head = new Block(this, header.number, header.hash)
    this.#registerBlock(this.#head)

    this.#txpool = new TxPool(this, inherentProvider, buildBlockMode)

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

  async getBlock(hash?: string): Promise<Block | undefined> {
    await this.api.isReady
    if (hash == null) {
      hash = this.head.hash
    }
    if (!this.#blocksByHash[hash]) {
      try {
        const registry = await this.head.registry
        const header: Header = registry.createType('Header', await this.api.getHeader(hash))
        const block = new Block(this, header.number.toNumber(), hash)
        this.#registerBlock(block)
      } catch (e) {
        logger.debug(`getBlock(${hash}) failed: ${e}`)
        return undefined
      }
    }
    return this.#blocksByHash[hash]
  }

  newTempBlock(parent: Block, header: Header): Block {
    const number = parent.number + 1
    const hash =
      '0x' +
      Math.round(Math.random() * 100000000)
        .toString(16)
        .padEnd(64, '0')
    const block = new Block(this, number, hash, parent, { header, extrinsics: [], storage: parent.storage })
    this.#blocksByHash[hash] = block
    return block
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

  setHead(block: Block): void {
    logger.debug(
      {
        number: block.number,
        hash: block.hash,
      },
      'setHead'
    )
    this.#head = block
    this.#registerBlock(block)
    this.headState.setHead(block)
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
    throw new ResponseError(1, `Extrinsic is invalid: ${validity.asErr.toString()}`)
  }

  async newBlock(): Promise<Block> {
    await this.#txpool.buildBlock()
    return this.#head
  }
}
