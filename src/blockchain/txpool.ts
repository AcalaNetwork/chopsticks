import { ApiPromise } from '@polkadot/api'
import { Header } from '@polkadot/types/interfaces'
import { bnToU8a, u8aToBn } from '@polkadot/util'
import _ from 'lodash'

import { Block } from './block'
import { Blockchain } from '.'
import { InherentProvider } from './inherents'
import { ResponseError } from '../rpc/shared'
import { defaultLogger } from '../logger'

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
  readonly #inherentProvider: InherentProvider

  #lastBuildBlockPromise: Promise<void> = Promise.resolve()

  constructor(
    chain: Blockchain,
    api: ApiPromise,
    inherentProvider: InherentProvider,
    mode: BuildBlockMode = BuildBlockMode.Batch
  ) {
    this.#chain = chain
    this.#api = api
    this.#mode = mode
    this.#inherentProvider = inherentProvider
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
    await this.#lastBuildBlockPromise
  }

  async #buildBlock(wait: Promise<void>) {
    await wait

    const head = this.#chain.head

    const extrinsics = this.#pool.splice(0)

    const parentHeader = await head.header

    const preRuntime = parentHeader.digest.logs[0].asPreRuntime
    const [consensusEngine, auraSlot] = preRuntime
    const newAuraSlot = bnToU8a(u8aToBn(auraSlot, { isLe: false }).addn(1), { isLe: true, bitLength: 64 })
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

    logger.info(
      {
        hash: head.hash,
        number: head.number,
        extrinsicsCount: extrinsics.length,
        tempHash: newBlock.hash,
      },
      'Building block'
    )

    const resp = await newBlock.call('Core_initialize_block', header.toHex())
    logger.trace(resp.storageDiff, 'Initialize block')

    newBlock.pushStorageLayer().setAll(resp.storageDiff)

    const inherents = await this.#inherentProvider.createInherents(this.#api, newBlock)

    for (const extrinsic of inherents) {
      try {
        const resp = await newBlock.call('BlockBuilder_apply_extrinsic', extrinsic)
        newBlock.pushStorageLayer().setAll(resp.storageDiff)
        logger.trace(resp.storageDiff, 'Applied inherent')
      } catch (e) {
        logger.info('Failed to apply inherents %o %s', e, e)
        throw new ResponseError(1, 'Failed to apply inherents')
      }
    }

    if (this.#api.query.parachainSystem?.validationData) {
      // this is a parachain
      const validationDataKey = this.#api.query.parachainSystem.validationData.key()
      const validationData = await newBlock.get(validationDataKey)
      if (!validationData) {
        // there is no set validation data inherent
        // so we need to restore the old validation data to make the on_finalize check happy
        const oldValidationData = await head.get(validationDataKey)
        newBlock.pushStorageLayer().set(validationDataKey, oldValidationData)
      }
    }

    for (const extrinsic of extrinsics) {
      try {
        const resp = await newBlock.call('BlockBuilder_apply_extrinsic', extrinsic)
        newBlock.pushStorageLayer().setAll(resp.storageDiff)
        logger.trace(resp.storageDiff, 'Applied extrinsic')
      } catch (e) {
        logger.info('Failed to apply extrinsic %o %s', e, e)
        this.#pool.push(extrinsic)
      }
    }

    const resp2 = await newBlock.call('BlockBuilder_finalize_block', '0x')

    newBlock.pushStorageLayer().setAll(resp2.storageDiff)
    logger.trace(resp2.storageDiff, 'Finalize block')

    const blockData = this.#api.createType('Block', {
      header,
      extrinsics,
    })

    const finalBlock = new Block(this.#api, this.#chain, newBlock.number, blockData.hash.toHex(), head, {
      header,
      extrinsics: [...inherents, ...extrinsics],
      storage: head.storage,
    })

    const diff = await newBlock.storageDiff()
    logger.trace(diff, 'Final block')
    finalBlock.pushStorageLayer().setAll(diff)

    this.#chain.unregisterBlock(newBlock)
    this.#chain.setHead(finalBlock)

    logger.info({ hash: finalBlock.hash, number: finalBlock.number, prevHash: newBlock.hash }, 'Block built')
  }
}
