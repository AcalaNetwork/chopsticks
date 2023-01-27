import { Handlers, ResponseError } from '../shared'
import { hexToU8a } from '@polkadot/util'

const handlers: Handlers = {
  payment_queryFeeDetails: async (context, [extrinsic, hash]) => {
    const block = await context.chain.getBlock(hash)
    if (!block) {
      throw new ResponseError(1, `Block ${hash} not found`)
    }
    const registry = await block.registry
    const tx = hexToU8a(extrinsic)
    const resp = await block.call('TransactionPaymentApi_query_fee_details', [
      registry.createType('Extrinsic', tx).toHex(),
      registry.createType('u32', tx.byteLength).toHex(),
    ])
    return resp.result
  },
  payment_queryInfo: async (context, [extrinsic, hash]) => {
    const block = await context.chain.getBlock(hash)
    if (!block) {
      throw new ResponseError(1, `Block ${hash} not found`)
    }
    const registry = await block.registry
    const tx = hexToU8a(extrinsic)
    const resp = await block.call('TransactionPaymentApi_query_info', [
      registry.createType('Extrinsic', tx).toHex(),
      registry.createType('u32', tx.byteLength).toHex(),
    ])
    return resp.result
  },
}

export default handlers
