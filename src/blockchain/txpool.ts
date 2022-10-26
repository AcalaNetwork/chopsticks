import { ApiPromise } from '@polkadot/api'
import { Header } from '@polkadot/types/interfaces'
import _ from 'lodash'

import { Block } from './block'
import { Blockchain } from '.'
import { defaultLogger } from '../logger'
import { u8aToBn } from '@polkadot/util'

const logger = defaultLogger.child({ name: 'txpool' })

export const enum BuildBlockMode {
  Batch, // one block per batch, default
  Instant, // one block per tx
  Manual, // only build when triggered
}

export class TxPool {
  readonly #api: ApiPromise
  readonly #chain: Blockchain
  readonly #pool: string[] = []
  readonly #mode: BuildBlockMode

  #lastBuildBlockPromise: Promise<void> = Promise.resolve()

  constructor(chain: Blockchain, api: ApiPromise, mode: BuildBlockMode = BuildBlockMode.Batch) {
    this.#chain = chain
    this.#api = api
    this.#mode = mode
  }

  submitExtrinsic(extrinsic: string) {
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

  async buildBlock() {
    const last = this.#lastBuildBlockPromise
    this.#lastBuildBlockPromise = this.#buildBlock(last)
  }

  async #buildBlock(wait: Promise<void>) {
    await wait

    const head = this.#chain.head

    logger.info({ hash: head.hash, number: head.number }, 'Building block')

    const parentHeader = await head.header

    const extrinsics = this.#pool.splice(0)

    const preRuntime = parentHeader.digest.logs[0].asPreRuntime
    const [consensusEngine, auraSlot] = preRuntime
    const newAuraSlot = u8aToBn(auraSlot, { isLe: false }).addn(1)
    const seal = parentHeader.digest.logs[1]
    const header = this.#api.createType('Header', {
      parentHash: head.hash,
      number: head.number + 1,
      stateRoot: '0x0000000000000000000000000000000000000000000000000000000000000000',
      extrinsicsRoot: '0x0000000000000000000000000000000000000000000000000000000000000000',
      digest: {
        logs: [{ PreRuntime: [consensusEngine, newAuraSlot] }, seal],
      },
    }) as Header

    const newBlock = this.#chain.newTempBlock(head, header)

    const resp = await newBlock.call('Core_initialize_block', header.toHex())

    newBlock.pushStorageLayer().setAll(resp.storageDiff)

    const setTimestamp = this.#api.tx.timestamp.set(Date.now())

    extrinsics.unshift(setTimestamp.toHex())

    for (const extrinsic of extrinsics) {
      try {
        const resp = await newBlock.call('BlockBuilder_apply_extrinsic', extrinsic)
        newBlock.pushStorageLayer().setAll(resp.storageDiff)
      } catch (e) {
        logger.info('Failed to apply extrinsic %o %s', e, e)
        this.#pool.push(extrinsic)
      }
    }

    const resp2 = await newBlock.call('BlockBuilder_finalize_block', '0x')

    newBlock.pushStorageLayer().setAll(resp2.storageDiff)

    const blockData = this.#api.createType('Block', {
      header,
      extrinsics,
    })

    const finalBlock = new Block(this.#api, this.#chain, newBlock.number, blockData.hash.toHex(), head, {
      header,
      extrinsics,
      storage: newBlock.storage,
    })

    this.#chain.unregisterBlock(newBlock)
    this.#chain.setHead(finalBlock)

    logger.info({ hash: finalBlock.hash, number: finalBlock.number }, 'Block built')
  }
}
