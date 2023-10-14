import { APPLY_EXTRINSIC_ERROR, Block } from '@acala-network/chopsticks-core'
import { HexString } from '@polkadot/util/types'
import { TransactionValidityError } from '@polkadot/types/interfaces'

import { Handler, ResponseError, SubscriptionManager } from '../shared'
import { defaultLogger } from '../../logger'

const logger = defaultLogger.child({ name: 'rpc-author' })

/**
 * @param context
 * @param params - [`extrinsic`]
 *
 * @return Hash
 */
export const author_submitExtrinsic: Handler<[HexString], HexString> = async (context, [extrinsic]) => {
  return context.chain.submitExtrinsic(extrinsic).catch((error: TransactionValidityError) => {
    const code = error.isInvalid ? 1010 : 1011
    throw new ResponseError(code, error.toString())
  })
}

/**
 * @param context
 * @param params - [`extrinsic`]
 * @param subscriptionManager
 *
 * @return subscription id
 */
export const author_submitAndWatchExtrinsic: Handler<[HexString], string> = async (
  context,
  [extrinsic],
  { subscribe, unsubscribe }: SubscriptionManager,
) => {
  let update = (_block: Block) => {}

  const id = context.chain.headState.subscribeHead((block) => update(block))
  const callback = subscribe('author_extrinsicUpdate', id, () => context.chain.headState.unsubscribeHead(id))

  const onExtrinsicFail = ([failedExtrinsic, error]: [string, TransactionValidityError]) => {
    if (failedExtrinsic === extrinsic) {
      callback(error.toJSON())
      done(id)
    }
  }

  context.chain.txPool.event.on(APPLY_EXTRINSIC_ERROR, onExtrinsicFail)

  const done = (id: string) => {
    context.chain.txPool.event.removeListener(APPLY_EXTRINSIC_ERROR, onExtrinsicFail)
    unsubscribe(id)
  }

  update = async (block) => {
    const extrisnics = await block.extrinsics
    if (!extrisnics.includes(extrinsic)) return

    logger.debug({ block: block.hash }, 'author_extrinsicUpdate')

    callback({
      inBlock: block.hash,
    })

    // wait a bit for InBlock to be sent
    await new Promise((r) => setTimeout(r, 50))

    callback({
      finalized: block.hash,
    })
    done(id)
  }

  try {
    await context.chain.submitExtrinsic(extrinsic)
    callback({
      ready: null,
    })
  } catch (error) {
    logger.error({ error }, 'ExtrinsicFailed')
    const code = (error as TransactionValidityError).isInvalid ? 1010 : 1011
    done(id)
    throw new ResponseError(code, (error as TransactionValidityError).toString())
  }
  return id
}

/**
 * @param _context
 * @param params - [`subid`]
 */
export const author_unwatchExtrinsic: Handler<[string], void> = async (_context, [subid], { unsubscribe }) => {
  unsubscribe(subid)
}

/**
 * Get pending extrinsics
 *
 * @return Array of pending extrinsics
 */
export const author_pendingExtrinsics: Handler<void, HexString[]> = async (context) => {
  return context.chain.txPool.pendingExtrinsics
}
