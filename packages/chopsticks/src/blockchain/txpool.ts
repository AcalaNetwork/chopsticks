import { EventEmitter } from 'node:stream'
import { HexString } from '@polkadot/util/types'
import _ from 'lodash'

import { Blockchain } from '.'
import { Deferred, defer } from '../utils'
import { InherentProvider } from './inherent'
import { buildBlock } from './block-builder'

export const APPLY_EXTRINSIC_ERROR = 'TxPool::ApplyExtrinsicError'

export enum BuildBlockMode {
  Batch, // one block per batch, default
  Instant, // one block per tx
  Manual, // only build when triggered
}

export interface DownwardMessage {
  sentAt: number
  msg: HexString
}

export interface HorizontalMessage {
  sentAt: number
  data: HexString
}

export interface BuildBlockParams {
  inherent?: {
    downwardMessages?: DownwardMessage[]
    horizontalMessages?: Record<number, HorizontalMessage[]>
  }
}

export class TxPool {
  readonly #chain: Blockchain
  readonly #pool: HexString[] = []
  readonly #mode: BuildBlockMode
  readonly #inherentProvider: InherentProvider
  readonly #pendingBlocks: { params: BuildBlockParams; deferred: Deferred<void> }[] = []

  readonly event = new EventEmitter()

  #isBuilding = false

  constructor(chain: Blockchain, inherentProvider: InherentProvider, mode: BuildBlockMode = BuildBlockMode.Batch) {
    this.#chain = chain
    this.#mode = mode
    this.#inherentProvider = inherentProvider
  }

  get pendingExtrinsics(): HexString[] {
    return this.#pool
  }

  submitExtrinsic(extrinsic: HexString) {
    this.#pool.push(extrinsic)

    switch (this.#mode) {
      case BuildBlockMode.Batch:
        this.#batchBuildBlock()
        break
      case BuildBlockMode.Instant:
        this.buildBlock()
        break
      case BuildBlockMode.Manual:
        // does nothing
        break
    }
  }

  #batchBuildBlock = _.debounce(this.buildBlock, 100, { maxWait: 1000 })

  async buildBlock(params?: BuildBlockParams) {
    this.#pendingBlocks.push({
      params: params || {},
      deferred: defer<void>(),
    })
    this.#buildBlockIfNeeded()
    await this.upcomingBlocks()
  }

  async upcomingBlocks() {
    const count = this.#pendingBlocks.length
    await this.#pendingBlocks[count - 1].deferred.promise
    return count
  }

  async #buildBlockIfNeeded() {
    if (this.#isBuilding) return
    if (this.#pendingBlocks.length === 0) return

    this.#isBuilding = true
    try {
      await this.#buildBlock()
    } finally {
      this.#isBuilding = false
      this.#buildBlockIfNeeded()
    }
  }

  async #buildBlock() {
    await this.#chain.api.isReady

    const pending = this.#pendingBlocks[0]
    if (!pending) {
      throw new Error('Unreachable')
    }
    const { params, deferred } = pending

    const head = this.#chain.head
    const extrinsics = this.#pool.splice(0)
    const inherents = await this.#inherentProvider.createInherents(head, params?.inherent)
    const [newBlock, pendingExtrinsics] = await buildBlock(head, inherents, extrinsics, (extrinsic, error) => {
      this.event.emit(APPLY_EXTRINSIC_ERROR, [extrinsic, error])
    })
    this.#pool.push(...pendingExtrinsics)
    await this.#chain.setHead(newBlock)

    this.#pendingBlocks.shift()
    deferred.resolve()
  }
}
