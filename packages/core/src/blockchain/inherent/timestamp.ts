import { Block } from '../block.js'
import { GenericExtrinsic } from '@polkadot/types'
import { HexString } from '@polkadot/util/types'
import { InherentProvider } from './index.js'
import { getCurrentTimestamp, getSlotDuration } from '../../utils/index.js'

export class SetTimestamp implements InherentProvider {
  async createInherents(newBlock: Block): Promise<HexString[]> {
    const parent = await newBlock.parentBlock
    if (!parent) throw new Error('parent block not found')
    const meta = await parent.meta
    const slotDuration = await getSlotDuration(parent.chain)
    const currentTimestamp = await getCurrentTimestamp(parent.chain)
    return [new GenericExtrinsic(meta.registry, meta.tx.timestamp.set(currentTimestamp + BigInt(slotDuration))).toHex()]
  }
}
