import { APPLY_EXTRINSIC_ERROR, Block } from '@acala-network/chopsticks-core'
import { HexString } from '@polkadot/util/types'
import { TransactionValidityError } from '@polkadot/types/interfaces'

import { Context, ResponseError, SubscriptionManager } from '../shared'
import { defaultLogger } from '../../logger'

const logger = defaultLogger.child({ name: 'rpc-author' })

export interface AuthorHandlers {
  /**
   * @param {Context} context
   * @param params - [`extrinsic`]
   */
  author_submitExtrinsic: (context: Context, [extrinsic]: [HexString]) => Promise<HexString>
  /**
   * @param {Context} context
   * @param params - [`extrinsic`]
   * @param {SubscriptionManager} subscriptionManager
   */
  author_submitAndWatchExtrinsic: (
    context: Context,
    [extrinsic]: [HexString],
    subscriptionManager: SubscriptionManager,
  ) => Promise<string>
  /**
   * @param {Context} context
   * @param params - [`subid`]
   * @param {SubscriptionManager} subscriptionManager
   */
  author_unwatchExtrinsic: (
    context: Context,
    [subid]: [string],
    subscriptionManager: SubscriptionManager,
  ) => Promise<void>
  author_pendingExtrinsics: (context: Context) => Promise<HexString[]>
}

/**
 * Substrate `author` RPC methods, see {@link AuthorHandlers} for methods details.
 */
const handlers: AuthorHandlers = {
  author_submitExtrinsic: async (context, [extrinsic]) => {
    return context.chain.submitExtrinsic(extrinsic).catch((error: TransactionValidityError) => {
      const code = error.isInvalid ? 1010 : 1011
      throw new ResponseError(code, error.toString())
    })
  },
  author_submitAndWatchExtrinsic: async (context, [extrinsic], { subscribe, unsubscribe }) => {
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
        InBlock: block.hash,
      })
      callback({
        Finalized: block.hash,
      })
      done(id)
    }

    try {
      await context.chain.submitExtrinsic(extrinsic)
      callback({
        Ready: null,
      })
    } catch (error) {
      logger.error({ error }, 'ExtrinsicFailed')
      const code = (error as TransactionValidityError).isInvalid ? 1010 : 1011
      done(id)
      throw new ResponseError(code, (error as TransactionValidityError).toString())
    }
    return id
  },
  author_unwatchExtrinsic: async (_context, [subid], { unsubscribe }) => {
    unsubscribe(subid)
  },
  author_pendingExtrinsics: async (context) => {
    return context.chain.txPool.pendingExtrinsics
  },
}

export default handlers
