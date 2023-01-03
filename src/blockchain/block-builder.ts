import { Block } from './block'
import { Header } from '@polkadot/types/interfaces'
import { HexString } from '@polkadot/util/types'
import { defaultLogger, truncate, truncateStorageDiff } from '../logger'

const logger = defaultLogger.child({ name: 'block-builder' })

export const buildBlock = async (
  head: Block,
  header: Header,
  inherents: HexString[],
  extrinsics: HexString[]
): Promise<[Block, HexString[]]> => {
  const registry = await head.registry

  const pendingExtrinsics: HexString[] = []

  const blockNumber = header.number.toNumber()
  const hash: HexString = `0x${Math.round(Math.random() * 100000000)
    .toString(16)
    .padEnd(64, '0')}`
  const newBlock = new Block(head.chain, blockNumber, hash, head, { header, extrinsics: [], storage: head.storage })

  logger.info(
    {
      number: blockNumber,
      extrinsicsCount: extrinsics.length,
      tempHash: newBlock.hash,
    },
    `Building block #${blockNumber.toLocaleString()}`
  )

  {
    // initialize block
    const { storageDiff } = await newBlock.call('Core_initialize_block', header.toHex())
    logger.trace(truncateStorageDiff(storageDiff), 'Initialize block')
    newBlock.pushStorageLayer().setAll(storageDiff)
  }

  // apply inherents
  for (const extrinsic of inherents) {
    try {
      const { storageDiff } = await newBlock.call('BlockBuilder_apply_extrinsic', extrinsic)
      newBlock.pushStorageLayer().setAll(storageDiff)
      logger.trace(truncateStorageDiff(storageDiff), 'Applied inherent')
    } catch (e) {
      logger.warn('Failed to apply inherents %o %s', e, e)
      throw new Error('Failed to apply inherents')
    }
  }

  // apply extrinsics
  for (const extrinsic of extrinsics) {
    try {
      const { storageDiff } = await newBlock.call('BlockBuilder_apply_extrinsic', extrinsic)
      newBlock.pushStorageLayer().setAll(storageDiff)
      logger.trace(truncateStorageDiff(storageDiff), 'Applied extrinsic')
    } catch (e) {
      logger.info('Failed to apply extrinsic %o %s', e, e)
      pendingExtrinsics.push(extrinsic)
    }
  }

  {
    // finalize block
    const { storageDiff } = await newBlock.call('BlockBuilder_finalize_block', '0x')

    newBlock.pushStorageLayer().setAll(storageDiff)
    logger.trace(truncateStorageDiff(storageDiff), 'Finalize block')
  }

  const blockData = registry.createType('Block', {
    header,
    extrinsics,
  })

  const storageDiff = await newBlock.storageDiff()
  logger.trace(
    Object.entries(storageDiff).map(([key, value]) => [key, truncate(value)]),
    'Final block'
  )
  const finalBlock = new Block(head.chain, blockNumber, blockData.hash.toHex(), head, {
    header,
    extrinsics: [...inherents, ...extrinsics],
    storage: head.storage,
    storageDiff,
  })

  logger.info(
    { hash: finalBlock.hash, number: blockNumber },
    `Block built #${blockNumber.toLocaleString()} hash ${finalBlock.hash}`
  )

  return [finalBlock, pendingExtrinsics]
}
