import { GenericExtrinsic } from '@polkadot/types'
import type { HexString } from '@polkadot/util/types'
import { getCurrentTimestamp, getSlotDuration } from '../../utils/index.js'
import type { Block } from '../block.js'
import type { InherentProvider } from './index.js'

export class SetTimestamp implements InherentProvider {
  async createInherents(newBlock: Block): Promise<HexString[]> {
    const parent = await newBlock.parentBlock
    if (!parent) throw new Error('parent block not found')
    const meta = await parent.meta
    const slotDuration = await getSlotDuration(newBlock)
    const currentTimestamp = await getCurrentTimestamp(parent)
    return [new GenericExtrinsic(meta.registry, meta.tx.timestamp.set(currentTimestamp + BigInt(slotDuration))).toHex()]
  }
}
