import { GenericExtrinsic } from '@polkadot/types'
import { HexString } from '@polkadot/util/types'

import { Block } from '../block.js'
import { BuildBlockParams } from '../txpool.js'
import { InherentProvider } from './index.js'

export class ParaInherentEnter implements InherentProvider {
  async createInherents(newBlock: Block, _params: BuildBlockParams): Promise<HexString[]> {
    const parent = await newBlock.parentBlock
    if (!parent) throw new Error('parent block not found')

    const meta = await parent.meta
    if (!meta.tx.paraInherent?.enter) {
      return []
    }

    if (parent.number === 0) {
      return [
        new GenericExtrinsic(
          meta.registry,
          meta.tx.paraInherent.enter({
            parentHeader: (await parent.header).toJSON(),
          }),
        ).toHex(),
      ]
    }

    const extrinsics = await parent.extrinsics

    const paraEnterExtrinsic = extrinsics.find((extrinsic) => {
      const firstArg = meta.registry.createType<GenericExtrinsic>('GenericExtrinsic', extrinsic)?.args?.[0]
      return firstArg && 'bitfields' in firstArg
    })
    if (!paraEnterExtrinsic) {
      throw new Error('Missing paraInherent data from block')
    }
    const extrinsic = meta.registry
      .createType<GenericExtrinsic>('GenericExtrinsic', paraEnterExtrinsic)
      .args[0].toJSON() as any

    const parentHeader = (await parent.header).toJSON()

    const newData = {
      ...extrinsic,
      bitfields: [],
      backedCandidates: [],
      parentHeader,
    }

    // TODO: fill with data

    return [new GenericExtrinsic(meta.registry, meta.tx.paraInherent.enter(newData)).toHex()]
  }
}
