import { ApiPromise } from '@polkadot/api'
import { blake2AsHex } from '@polkadot/util-crypto'
import { u8aConcat, u8aToHex } from '@polkadot/util'
import type { TransactionValidity } from '@polkadot/types/interfaces/txqueue'

import { Block } from './block'
import { ResponseError } from '../rpc/shared'
import { TaskManager } from '../task'

export class Blockchain {
  readonly #api: ApiPromise
  readonly tasks: TaskManager

  #head: Block
  readonly #blocksByNumber: Block[] = []
  readonly #blocksByHash: Record<string, Block> = {}

  constructor(api: ApiPromise, tasks: TaskManager, header: { number: number; hash: string }) {
    this.#api = api
    this.tasks = tasks
    this.#head = new Block(api, this, header.number, header.hash)
    this.#registerBlock(this.#head)
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

  async submitExtrinsic(extrinsic: string): Promise<string> {
    const source = '0x02' // External
    const args = u8aToHex(u8aConcat(source, extrinsic, this.head.hash))
    const res = await this.head.call('TaggedTransactionQueue_validate_transaction', args)
    const validity: TransactionValidity = this.#api.createType('TransactionValidity', res)
    if (validity.isOk) {
      return blake2AsHex(extrinsic, 256)
    }
    throw new ResponseError(1, `Extrinsic is invalid: ${validity.asErr.toString()}`)
  }
}
