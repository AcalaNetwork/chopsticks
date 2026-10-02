import { hexToU8a } from '@polkadot/util'
import type { HexString } from '@polkadot/util/types'

import { isGeneralExtrinsic } from '../../utils/index.js'
import { type Handler, ResponseError } from '../shared.js'

/**
 * @param context
 * @param params - [`extrinsic`, `blockhash`]
 *
 * @return result in hash
 */
export const payment_queryFeeDetails: Handler<[HexString, HexString], HexString> = async (
  context,
  [extrinsic, hash],
) => {
  const block = await context.chain.getBlock(hash)
  if (!block) {
    throw new ResponseError(1, `Block ${hash} not found`)
  }
  const registry = await block.registry
  const tx = hexToU8a(extrinsic)
  const resp = await block.call('TransactionPaymentApi_query_fee_details', [
    // polkadot.js cannot always decode a general (v5) extrinsic; the runtime takes its bytes as they are
    isGeneralExtrinsic(tx) ? extrinsic : registry.createType('Extrinsic', tx).toHex(),
    registry.createType('u32', tx.byteLength).toHex(),
  ])
  return resp.result
}

/**
 * @param context
 * @param params - [`extrinsic`, `blockhash`]
 *
 * @return result in hash
 */
export const payment_queryInfo: Handler<[HexString, HexString], HexString> = async (context, [extrinsic, hash]) => {
  const block = await context.chain.getBlock(hash)
  if (!block) {
    throw new ResponseError(1, `Block ${hash} not found`)
  }
  const registry = await block.registry
  const tx = hexToU8a(extrinsic)
  const resp = await block.call('TransactionPaymentApi_query_info', [
    // polkadot.js cannot always decode a general (v5) extrinsic; the runtime takes its bytes as they are
    isGeneralExtrinsic(tx) ? extrinsic : registry.createType('Extrinsic', tx).toHex(),
    registry.createType('u32', tx.byteLength).toHex(),
  ])
  return resp.result
}
