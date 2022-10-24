import { ApiPromise } from '@polkadot/api'
import { Header } from '@polkadot/types/interfaces'
import { blake2AsHex } from '@polkadot/util-crypto'
import { u8aConcat, u8aToHex } from '@polkadot/util'
import type { TransactionValidity } from '@polkadot/types/interfaces/txqueue'

import { Block } from './block'
import { HeadState } from './head-state'
import { ResponseError } from '../rpc/shared'
import { TaskManager } from '../task'
import { TxPool } from './txpool'
import { defaultLogger } from '../logger'

const logger = defaultLogger.child({ name: 'blockchain' })

export class Blockchain {
  readonly #api: ApiPromise
  readonly tasks: TaskManager
  readonly #txpool: TxPool

  #head: Block
  readonly #blocksByNumber: Block[] = []
  readonly #blocksByHash: Record<string, Block> = {}

  readonly headState: HeadState

  constructor(api: ApiPromise, tasks: TaskManager, header: { number: number; hash: string }) {
    this.#api = api
    this.tasks = tasks
    this.#head = new Block(api, this, header.number, header.hash)
    this.#registerBlock(this.#head)

    this.#txpool = new TxPool(this, api)

    this.headState = new HeadState(this.#head)
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

  async getBlock(hash: string = this.head.hash): Promise<Block | undefined> {
    if (!this.#blocksByHash[hash]) {
      try {
        const header = await this.#api.rpc.chain.getHeader(hash)
        const block = new Block(this.#api, this, header.number.toNumber(), hash)
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
    const block = new Block(this.#api, this, number, hash, parent, { header, extrinsics: [], storage: parent.storage })
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

  async submitExtrinsic(extrinsic: string): Promise<string> {
    const source = '0x02' // External
    const args = u8aToHex(u8aConcat(source, extrinsic, this.head.hash))
    const res = await this.head.call('TaggedTransactionQueue_validate_transaction', args)
    const validity: TransactionValidity = this.#api.createType('TransactionValidity', res.result)
    if (validity.isOk) {
      this.#txpool.submitExtrinsic(extrinsic)
      return blake2AsHex(extrinsic, 256)
    }
    throw new ResponseError(1, `Extrinsic is invalid: ${validity.asErr.toString()}`)
  }
}
