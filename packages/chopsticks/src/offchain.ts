import { Block } from './blockchain/block'
import { HexString } from '@polkadot/util/types'
import { blake2AsHex } from '@polkadot/util-crypto'
import { logger } from './rpc/shared'
import { queueScheduler } from 'rxjs'

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
      `Run Offchain Worker for block #${block.number.toLocaleString()}`
    )

    const result = await block.offchainWorker()

    for (const [key, value] of result.offchainStorageDiff) {
      this.set(key, value)
    }

    logger.info(`Offchain Worker complete for block #${block.number.toLocaleString()}`)

    const txs = this.pendingExtrinsics.splice(0)

    if (txs.length > 0) {
      queueScheduler.schedule(
        async (transactions) => {
          await block.chain.txPool.buildBlock({ transactions })
        },
        100,
        txs
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
