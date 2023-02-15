import { filter } from 'rxjs/operators'

import { Block } from '../../blockchain/block'
import { Handlers, ResponseError } from '../../rpc/shared'
import { defaultLogger } from '../../logger'

const logger = defaultLogger.child({ name: 'rpc-author' })

const handlers: Handlers = {
  author_submitExtrinsic: async (context, [extrinsic]) => {
    return context.chain.submitExtrinsic(extrinsic).catch((error) => {
      throw new ResponseError(1, error.toString())
    })
  },
  author_submitAndWatchExtrinsic: async (context, [extrinsic], { subscribe, unsubscribe }) => {
    let update = (_block: Block) => {}

    const id = context.chain.headState.subscribeHead((block) => update(block))
    const callback = subscribe('author_extrinsicUpdate', id, () => context.chain.headState.unsubscribeHead(id))

    const errorSub = context.chain.applyExtrinsicError.pipe(filter((x) => x === extrinsic)).subscribe(([_, error]) => {
      callback(null, new ResponseError(1, error.toString()))
      done(id)
    })

    const done = (id: string) => {
      errorSub.unsubscribe()
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
      .catch((error: Error) => {
        logger.error({ error }, 'ExtrinsicFailed')
        callback(null, new ResponseError(1, error.message))
        done(id)
      })
    return id
  },
  author_unwatchExtrinsic: async (_context, [subid], { unsubscribe }) => {
    unsubscribe(subid)
  },
  author_pendingExtrinsics: async (context) => {
    return context.chain.pendingExtrinsics
  },
}

export default handlers
