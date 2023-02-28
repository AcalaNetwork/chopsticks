import { APPLY_EXTRINSIC_ERROR } from '../../blockchain/txpool'
import { Block } from '../../blockchain/block'
import { Handlers, ResponseError } from '../shared'
import { TransactionValidityError } from '@polkadot/types/interfaces'
import { defaultLogger } from '../../logger'

const logger = defaultLogger.child({ name: 'rpc-author' })

const handlers: Handlers = {
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
      // for now just assume tx is always included on next block
      callback({
        InBlock: block.hash,
      })
      callback({
        Finalized: block.hash,
      })
      done(id)
    }

    context.chain
      .submitExtrinsic(extrinsic)
      .then(() => {
        callback({
          Ready: null,
        })
      })
      .catch((error: TransactionValidityError) => {
        logger.error({ error }, 'ExtrinsicFailed')
        callback(error?.toJSON() ?? error)
        done(id)
      })
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
