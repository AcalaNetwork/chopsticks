import { HexString } from '@polkadot/util/types'

import { Handler, ResponseError } from '../shared.js'
import { chain_getBlockHash } from './chain.js'

/**
 * @param context
 * @param params - [`blockhash`]
 *
 * @return Block extrinsics
 */
export const archive_unstable_body: Handler<[HexString], HexString[]> = async (context, [hash]) => {
  const block = await context.chain.getBlock(hash)
  if (!block) {
    throw new ResponseError(1, `Block ${hash} not found`)
  }
  return await block.extrinsics
}

export const archive_unstable_hashByHeight = chain_getBlockHash
