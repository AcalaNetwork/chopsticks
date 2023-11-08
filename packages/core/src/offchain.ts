import { Block } from './blockchain/block.js'
import { HexString } from '@polkadot/util/types'
import { blake2AsHex } from '@polkadot/util-crypto'
import { defaultLogger } from './logger.js'
import { queueScheduler } from 'rxjs'

const logger = defaultLogger.child({ name: 'offchain' })

export class OffchainWorker {
  readonly pendingExtrinsics: HexString[] = []
  readonly offchainStorage: Map<string, string | null | undefined> = new Map()

  get(key: string): string | null | undefined {
    return this.offchainStorage.get(key)
  }

  set(key: string, value: string | null | undefined) {
    this.offchainStorage.set(key, value)
  }

  async run(block: Block) {
    logger.info(
      { number: block.number, hash: block.hash },
      `Run Offchain Worker for block #${block.number.toLocaleString()}`,
    )

    const header = await block.header
    await block.call('OffchainWorkerApi_offchain_worker', [header.toHex()])

    logger.info(`Offchain Worker complete for block #${block.number.toLocaleString()}`)

    const txs = this.pendingExtrinsics.splice(0)

    if (txs.length > 0) {
      queueScheduler.schedule(
        async (transactions) => {
          await block.chain.txPool.buildBlock({ transactions })
        },
        100,
        txs,
      )
    }
  }

  async pushExtrinsic(block: Block, extrinsic: HexString) {
    const validity = await block.chain.validateExtrinsic(extrinsic, '0x01')
    if (validity.isOk) {
      this.pendingExtrinsics.push(extrinsic)
      return blake2AsHex(extrinsic, 256)
    }
    throw validity.asErr
  }
}
