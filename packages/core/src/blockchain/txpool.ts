import { EventEmitter } from 'eventemitter3'
import { GenericExtrinsic } from '@polkadot/types'
import { HexString } from '@polkadot/util/types'
import { hexToU8a } from '@polkadot/util/hex/toU8a'
import _ from 'lodash'

import { Blockchain } from './index.js'
import { Deferred, defer } from '../utils/index.js'
import { InherentProvider } from './inherent/index.js'
import { buildBlock } from './block-builder.js'
import { defaultLogger, truncate } from '../logger.js'

const logger = defaultLogger.child({ name: 'txpool' })

export const APPLY_EXTRINSIC_ERROR = 'TxPool::ApplyExtrinsicError'

export enum BuildBlockMode {
  /** One block per batch (default) */
  Batch = 'Batch',
  /** One block per tx */
  Instant = 'Instant',
  /** Only build when triggered */
  Manual = 'Manual',
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
  downwardMessages: DownwardMessage[]
  upwardMessages: Record<number, HexString[]>
  horizontalMessages: Record<number, HorizontalMessage[]>
  transactions: HexString[]
  unsafeBlockHeight?: number
}

export class TxPool {
  readonly #chain: Blockchain

  readonly #pool: { extrinsic: HexString; signer: string }[] = []
  readonly #ump: Record<number, HexString[]> = {}
  readonly #dmp: DownwardMessage[] = []
  readonly #hrmp: Record<number, HorizontalMessage[]> = {}

  #mode: BuildBlockMode
  readonly #inherentProviders: InherentProvider[]
  readonly #pendingBlocks: { params: BuildBlockParams; deferred: Deferred<void> }[] = []

  readonly event = new EventEmitter()

  #isBuilding = false

  constructor(chain: Blockchain, inherentProviders: InherentProvider[], mode: BuildBlockMode = BuildBlockMode.Batch) {
    this.#chain = chain
    this.#mode = mode
    this.#inherentProviders = inherentProviders
  }

  get pendingExtrinsics(): HexString[] {
    return this.#pool.map(({ extrinsic }) => extrinsic)
  }

  get ump(): Record<number, HexString[]> {
    return this.#ump
  }

  get dmp(): DownwardMessage[] {
    return this.#dmp
  }

  get hrmp(): Record<number, HorizontalMessage[]> {
    return this.#hrmp
  }

  get mode(): BuildBlockMode {
    return this.#mode
  }

  set mode(mode: BuildBlockMode) {
    this.#mode = mode
  }

  clear() {
    this.#pool.length = 0
    for (const id of Object.keys(this.#ump)) {
      delete this.#ump[id]
    }
    this.#dmp.length = 0
    for (const id of Object.keys(this.#hrmp)) {
      delete this.#hrmp[id]
    }
  }

  pendingExtrinsicsBy(address: string): HexString[] {
    return this.#pool.filter(({ signer }) => signer === address).map(({ extrinsic }) => extrinsic)
  }

  async submitExtrinsic(extrinsic: HexString) {
    logger.debug({ extrinsic: truncate(extrinsic) }, 'submit extrinsic')

    this.#pool.push({ extrinsic, signer: await this.#getSigner(extrinsic) })

    this.#maybeBuildBlock()
  }

  async #getSigner(extrinsic: HexString) {
    const registry = await this.#chain.head.registry
    const tx = registry.createType<GenericExtrinsic>('GenericExtrinsic', extrinsic)
    return tx.signer.toString()
  }

  submitUpwardMessages(id: number, ump: HexString[]) {
    logger.debug({ id, ump: truncate(ump) }, 'submit upward messages')

    if (!this.#ump[id]) {
      this.#ump[id] = []
    }
    this.#ump[id].push(...ump)

    this.#maybeBuildBlock()
  }

  submitDownwardMessages(dmp: DownwardMessage[]) {
    logger.debug({ dmp: truncate(dmp) }, 'submit downward messages')

    this.#dmp.push(...dmp)

    this.#maybeBuildBlock()
  }

  submitHorizontalMessages(id: number, hrmp: HorizontalMessage[]) {
    logger.debug({ id, hrmp: truncate(hrmp) }, 'submit horizontal messages')

    if (!this.#hrmp[id]) {
      this.#hrmp[id] = []
    }
    this.#hrmp[id].push(...hrmp)

    this.#maybeBuildBlock()
  }

  #maybeBuildBlock() {
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

  async buildBlockWithParams(params: BuildBlockParams) {
    this.#pendingBlocks.push({
      params,
      deferred: defer<void>(),
    })
    this.#buildBlockIfNeeded()
    await this.upcomingBlocks()
  }

  async buildBlock(params?: Partial<BuildBlockParams>) {
    const transactions = params?.transactions || this.#pool.splice(0).map(({ extrinsic }) => extrinsic)
    const upwardMessages = params?.upwardMessages || { ...this.#ump }
    const downwardMessages = params?.downwardMessages || this.#dmp.splice(0)
    const horizontalMessages = params?.horizontalMessages || { ...this.#hrmp }
    const unsafeBlockHeight = params?.unsafeBlockHeight
    if (!params?.upwardMessages) {
      for (const id of Object.keys(this.#ump)) {
        delete this.#ump[id]
      }
    }
    if (!params?.horizontalMessages) {
      for (const id of Object.keys(this.#hrmp)) {
        delete this.#hrmp[id]
      }
    }

    try {
      await this.buildBlockWithParams({
        transactions,
        upwardMessages,
        downwardMessages,
        horizontalMessages,
        unsafeBlockHeight,
      })

      // with the latest message queue, messages are processed in the upcoming block
      if (!this.#chain.processQueuedMessages) return
      // if block was built without horizontal or downward messages then skip
      if (_.isEmpty(horizontalMessages) && _.isEmpty(downwardMessages)) return

      // messageQueue.bookStateFor
      const prefix = '0xb8753e9383841da95f7b8871e5de326954e062a2cf8df68178ee2e5dbdf00bff'
      const meta = await this.#chain.head.meta
      const keys = await this.#chain.head.getKeysPaged({ prefix, pageSize: 1000 })
      for (const key of keys) {
        const rawValue = await this.#chain.head.get(key)
        if (!rawValue) continue
        const message = meta.registry.createType('PalletMessageQueueBookState', hexToU8a(rawValue)).toJSON() as any
        if (message.size > 0) {
          logger.info('Queued messages detected, building a new block')
          // build a new block to process the queued messages
          await this.#chain.newBlock()
          return
        }
      }
    } catch (err) {
      logger.error({ err }, 'build block failed')
    }
  }

  async upcomingBlocks() {
    const count = this.#pendingBlocks.length
    if (count > 0) {
      await this.#pendingBlocks[count - 1].deferred.promise
    }
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
    }
    this.#buildBlockIfNeeded()
  }

  async #buildBlock() {
    await this.#chain.api.isReady

    const pending = this.#pendingBlocks[0]
    if (!pending) {
      throw new Error('Unreachable')
    }
    const { params, deferred } = pending

    logger.trace({ params }, 'build block')

    const [newBlock, pendingExtrinsics] = await buildBlock(this.#chain.head, this.#inherentProviders, params, {
      onApplyExtrinsicError: (extrinsic, error) => {
        this.event.emit(APPLY_EXTRINSIC_ERROR, [extrinsic, error])
      },
      onPhaseApplied:
        logger.level.toLowerCase() === 'trace'
          ? (phase, resp) => {
              switch (phase) {
                case 'initialize':
                  logger.trace(truncate(resp.storageDiff), 'Initialize block')
                  break
                case 'finalize':
                  logger.trace(truncate(resp.storageDiff), 'Finalize block')
                  break
                default:
                  logger.trace(truncate(resp.storageDiff), `Apply extrinsic ${phase}`)
              }
            }
          : undefined,
    })
    for (const extrinsic of pendingExtrinsics) {
      this.#pool.push({ extrinsic, signer: await this.#getSigner(extrinsic) })
    }
    await this.#chain.onNewBlock(newBlock)

    this.#pendingBlocks.shift()
    deferred.resolve()
  }
}
