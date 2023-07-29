import { GenericExtrinsic } from '@polkadot/types'
import { HexString } from '@polkadot/util/types'

import { Block } from '../block'
import { BuildBlockParams } from '../txpool'
import { CreateInherents } from '.'

export class ParaInherentEnter implements CreateInherents {
  async createInherents(parent: Block, _params: BuildBlockParams): Promise<HexString[]> {
    const meta = await parent.meta
    if (!meta.tx.paraInherent?.enter) {
      return []
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
