import type { HexString } from '@polkadot/util/types'

import { type Handler, ResponseError } from '../shared.js'
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

/**
 * @param context
 * @param params - [`blockhash`, `method`, `data` ]
*
* @return result in hash
*/
export const archive_unstable_call: Handler<[HexString, string, HexString], { success: boolean; value: `0x${string}`; }> = async (
  context,
  [hash, method, data],
) => {
  const block = await context.chain.getBlock(hash)
  if (!block) {
    throw new ResponseError(1, `Block ${hash} not found`)
  }
  
  const resp = await block.call(method, [data])
  return {success: true, value: resp.result}
}

export const archive_unstable_hashByHeight = chain_getBlockHash