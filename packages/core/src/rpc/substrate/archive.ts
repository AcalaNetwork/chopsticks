import type { HexString } from '@polkadot/util/types'

import { type Handler, ResponseError } from '../shared.js'
import { chain_getBlockHash } from './chain.js'
import { state_call } from './state.js'

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
export const archive_unstable_call = state_call
