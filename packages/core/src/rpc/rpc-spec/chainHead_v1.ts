import { Block } from '../../blockchain/block.js'
import { Handler, SubscriptionManager } from '../shared.js'
import { defaultLogger } from '../../logger.js'

const logger = defaultLogger.child({ name: 'rpc-chainHead_v1' })

const callbacks = new Map<string, (data: any) => void>()

async function afterResponse(fn: () => void) {
  await Promise.resolve()
  fn()
}

export const chainHead_v1_follow: Handler<[boolean], string> = async (
  context,
  [withRuntime],
  { subscribe }: SubscriptionManager,
) => {
  const update = async (block: Block) => {
    logger.trace({ hash: block.hash }, 'chainHead_v1_follow')

    const getNewRuntime = async () => {
      const [runtime, previousRuntime] = await Promise.all([
        block.runtimeVersion,
        block.parentBlock.then((b) => b?.runtimeVersion),
      ])
      const hasNewRuntime =
        runtime.implVersion !== previousRuntime?.implVersion || runtime.specVersion !== previousRuntime.specVersion
      return hasNewRuntime ? runtime : null
    }
    const newRuntime = withRuntime ? await getNewRuntime() : null

    callback({
      event: 'newBlock',
      blockHash: block.hash,
      parentBlockHash: block.parentBlock,
      newRuntime,
    })
    callback({
      event: 'bestBlockChanged',
      bestBlockHash: block.hash,
    })
    callback({
      event: 'finalized',
      finalizedBlockHashes: [block.hash],
      prunedBlockHashes: [],
    })
  }

  const id = context.chain.headState.subscribeHead(update)

  const cleanup = () => {
    context.chain.headState.unsubscribeHead(id)
    callbacks.delete(id)
  }
  const callback = subscribe('chainHead_v1_followEvent', id, cleanup)

  callbacks.set(id, callback)

  afterResponse(async () => {
    callback({
      event: 'initialized',
      finalizedBlockHashes: [context.chain.head.hash],
      finalizedBlockRuntime: withRuntime ? await context.chain.head.runtimeVersion : null,
    })
  })

  return id
}

export const chainHead_v1_unfollow: Handler<[string], null> = async (_, [followSubscription], { unsubscribe }) => {
  unsubscribe(followSubscription)

  return null
}
