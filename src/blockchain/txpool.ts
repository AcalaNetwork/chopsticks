import { Header, RawBabePreDigest } from '@polkadot/types/interfaces'
import { HexString } from '@polkadot/util/types'
import { compactAddLength } from '@polkadot/util'
import _ from 'lodash'

import { Blockchain } from '.'
import { InherentProvider } from './inherent'
import { buildBlock } from './block-builder'
import { getCurrentSlot } from '../utils/time-travel'

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

const getConsensus = (header: Header) => {
  if (header.digest.logs.length === 0) return
  const preRuntime = header.digest.logs[0].asPreRuntime
  const [consensusEngine, slot] = preRuntime
  return { consensusEngine, slot, rest: header.digest.logs.slice(1) }
}

const getNewSlot = (digest: RawBabePreDigest, slotNumber: number) => {
  if (digest.isPrimary) {
    return {
      primary: {
        ...digest.asPrimary.toJSON(),
        slotNumber,
      },
    }
  }
  if (digest.isSecondaryPlain) {
    return {
      secondaryPlain: {
        ...digest.asSecondaryPlain.toJSON(),
        slotNumber,
      },
    }
  }
  if (digest.isSecondaryVRF) {
    return {
      secondaryVRF: {
        ...digest.asSecondaryVRF.toJSON(),
        slotNumber,
      },
    }
  }
  return digest.toJSON()
}

export class TxPool {
  readonly #chain: Blockchain
  readonly #pool: HexString[] = []
  readonly #mode: BuildBlockMode
  readonly #inherentProvider: InherentProvider

  #lastBuildBlockPromise: Promise<void> = Promise.resolve()

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
  }

  async #buildBlock(wait: Promise<void>, params?: BuildBlockParams) {
    await this.#chain.api.isReady
    await wait.catch(() => {}) // ignore error
    const head = this.#chain.head
    const extrinsics = this.#pool.splice(0)

    const meta = await head.meta
    const parentHeader = await head.header

    let newLogs = parentHeader.digest.logs as any
    const consensus = getConsensus(parentHeader)
    if (consensus?.consensusEngine.isAura) {
      const slot = await getCurrentSlot(this.#chain)
      const newSlot = compactAddLength(meta.registry.createType('Slot', slot + 1).toU8a())
      newLogs = [{ PreRuntime: [consensus.consensusEngine, newSlot] }, ...consensus.rest]
    } else if (consensus?.consensusEngine.isBabe) {
      const slot = await getCurrentSlot(this.#chain)
      const digest = meta.registry.createType<RawBabePreDigest>('RawBabePreDigest', consensus.slot)
      const newSlot = compactAddLength(
        meta.registry.createType('RawBabePreDigest', getNewSlot(digest, slot + 1)).toU8a()
      )
      newLogs = [{ PreRuntime: [consensus.consensusEngine, newSlot] }, ...consensus.rest]
    }

    const registry = await head.registry
    const header: Header = registry.createType('Header', {
      parentHash: head.hash,
      number: head.number + 1,
      stateRoot: '0x0000000000000000000000000000000000000000000000000000000000000000',
      extrinsicsRoot: '0x0000000000000000000000000000000000000000000000000000000000000000',
      digest: {
        logs: newLogs,
      },
    })

    const inherents = await this.#inherentProvider.createInherents(head, params?.inherent)
    const [newBlock, pendingExtrinsics] = await buildBlock(head, header, inherents, extrinsics)
    this.#pool.push(...pendingExtrinsics)
    await this.#chain.setHead(newBlock)
  }
}
