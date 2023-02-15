import { BehaviorSubject, firstValueFrom } from 'rxjs'
import { EventEmitter } from 'node:stream'
import { HexString } from '@polkadot/util/types'
import { skip, take } from 'rxjs/operators'
import _ from 'lodash'

import { Block } from './block'
import { Blockchain } from '.'
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

  readonly event = new EventEmitter()

  #last: BehaviorSubject<Block>
  #lastBuildBlockPromise: Promise<void> = Promise.resolve()

  constructor(chain: Blockchain, inherentProvider: InherentProvider, mode: BuildBlockMode = BuildBlockMode.Batch) {
    this.#chain = chain
    this.#last = new BehaviorSubject<Block>(chain.head)
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
    const last = this.#lastBuildBlockPromise
    this.#lastBuildBlockPromise = this.#buildBlock(last, params)
    await this.#lastBuildBlockPromise
    this.#last.next(this.#chain.head)
  }

  async upcomingBlock(skipCount = 0) {
    if (skipCount < 0) throw new Error('skipCount needs to be greater or equal to 0')
    return firstValueFrom(this.#last.pipe(skip(1 + skipCount), take(1)))
  }

  async #buildBlock(wait: Promise<void>, params?: BuildBlockParams) {
    await this.#chain.api.isReady
    await wait.catch(() => {}) // ignore error
    const head = this.#chain.head
    const extrinsics = this.#pool.splice(0)
    const inherents = await this.#inherentProvider.createInherents(head, params?.inherent)
    const [newBlock, pendingExtrinsics] = await buildBlock(head, inherents, extrinsics, (extrinsic, error) => {
      this.event.emit(APPLY_EXTRINSIC_ERROR, [extrinsic, error])
    })
    this.#pool.push(...pendingExtrinsics)
    await this.#chain.setHead(newBlock)
  }
}
