import { HexString } from '@polkadot/util/types'
import { ReplaySubject, share } from 'rxjs'
import { skip } from 'rxjs/operators'
import _ from 'lodash'

import { Block } from './block'
import { Blockchain } from '.'
import { InherentProvider } from './inherent'
import { buildBlock } from './block-builder'

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

  #lastBuildBlockPromise: Promise<void> = Promise.resolve()

  #last = new ReplaySubject<Block>(1)
  #upcoming = this.#last.pipe(share())

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
    const last = this.#lastBuildBlockPromise
    this.#lastBuildBlockPromise = this.#buildBlock(last, params)
    await this.#lastBuildBlockPromise
    this.#last.next(this.#chain.head)
  }

  async upcomingBlock(count = 1) {
    if (count < 1) throw new Error('count needs to be greater than 0')
    return new Promise<Block>((resolve) => {
      const sub = this.#upcoming.pipe(skip(count - 1)).subscribe((block) => {
        sub.unsubscribe()
        resolve(block)
      })
    })
  }

  async #buildBlock(wait: Promise<void>, params?: BuildBlockParams) {
    await this.#chain.api.isReady
    await wait.catch(() => {}) // ignore error
    const head = this.#chain.head
    const extrinsics = this.#pool.splice(0)
    const inherents = await this.#inherentProvider.createInherents(head, params?.inherent)
    const [newBlock, pendingExtrinsics] = await buildBlock(head, inherents, extrinsics)
    this.#pool.push(...pendingExtrinsics)
    await this.#chain.setHead(newBlock)
  }
}
