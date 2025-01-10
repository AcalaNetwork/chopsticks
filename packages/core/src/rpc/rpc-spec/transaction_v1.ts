import type { HexString } from '@polkadot/util/types'
import { defaultLogger } from '../../logger.js'
import type { Handler } from '../shared.js'

const logger = defaultLogger.child({ name: 'rpc-transaction_v1' })
const randomId = () => Math.random().toString(36).substring(2)

/**
 * Submit the extrinsic to the transaction pool
 *
 * @param context
 * @param params - [`extrinsic`]
 *
 * @return operation id
 */
export const transaction_v1_broadcast: Handler<[HexString], string | null> = async (context, [extrinsic]) => {
  await context.chain.submitExtrinsic(extrinsic).catch((err) => {
    // As per the spec, the invalid transaction errors should be ignored.
    logger.warn('Submit extrinsic failed', err)
  })

  return randomId()
}

/**
 * Stop broadcasting the transaction to other nodes.
 *
 */
export const transaction_v1_stop: Handler<[string], null> = async (_context, [_operationId]) => {
  // Chopsticks doesn't have any process to broadcast the transaction through P2P
  // so stopping doesn't have any effect.
  return null
}
