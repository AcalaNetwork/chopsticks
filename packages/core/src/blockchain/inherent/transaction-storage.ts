import { GenericExtrinsic } from '@polkadot/types'
import type { HexString } from '@polkadot/util/types'
import { compactHex } from '../../utils/index.js'
import type { Block } from '../block.js'
import type { InherentProvider } from './index.js'

export class SetTransactionStorageProof implements InherentProvider {
  async createInherents(newBlock: Block): Promise<HexString[]> {
    const parent = await newBlock.parentBlock
    if (!parent) throw new Error('parent block not found')
    const meta = await parent.meta
    if (!meta.tx.transactionStorage?.applyBlockInherents) {
      return []
    }

    // The runtime's on_finalize asserts ProofChecked was set when stored
    // transactions exist at (block - RetentionPeriod). Generating a real
    // proof requires the original chunk data Chopsticks doesn't have, so
    // we force the flag via storage override instead.
    if (meta.query.transactionStorage?.proofChecked) {
      const key = compactHex(meta.query.transactionStorage.proofChecked())
      newBlock.pushStorageLayer().set(key, '0x01')
    }

    const inherent = new GenericExtrinsic(meta.registry, meta.tx.transactionStorage.applyBlockInherents(null))
    return [inherent.toHex()]
  }
}
