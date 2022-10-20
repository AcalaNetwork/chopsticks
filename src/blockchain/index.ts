import { ApiPromise } from '@polkadot/api'
import { TaskManager } from '../task'

import { Block } from './block'

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
