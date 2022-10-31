import { Block } from '../../blockchain/block'
import { Handlers } from '../shared'
import { defaultLogger } from '../../logger'

const logger = defaultLogger.child({ name: 'rpc-author' })

const handlers: Handlers = {
  author_submitExtrinsic: async (context, [extrinsic]) => {
    return context.chain.submitExtrinsic(extrinsic)
  },
  author_submitAndWatchExtrinsic: async (context, [extrinsic], { subscribe, unsubscribe }) => {
    let update = (_block: Block) => {}

    const id = context.chain.headState.subscribeHead((block) => update(block))
    const callback = subscribe('author_extrinsicUpdate', id, () => context.chain.headState.unsubscribeHead(id))

    update = async (block) => {
      logger.debug({ block: block.hash }, 'author_extrinsicUpdate')
      // for now just assume tx is always included on next block
      callback({
        InBlock: block.hash,
      })
      callback({
        Finalized: block.hash,
      })
      unsubscribe(id)
    }

    context.chain
      .submitExtrinsic(extrinsic)
      .then(() => {
        callback({
          Ready: null,
        })
      })
      .catch((error) => {
        logger.error({ error }, 'ExtrinsicFailed')
        callback({ Invalid: null })
        unsubscribe(id)
      })
    return id
  },
  author_unwatchExtrinsic: async (_context, [subid], { unsubscribe }) => {
    unsubscribe(subid)
  },
}

export default handlers
