import { Block } from '../../blockchain/block'
import { Handlers } from '../shared'
import { defaultLogger } from '../../logger'

const logger = defaultLogger.child({ name: 'rpc-state' })

const handlers: Handlers = {
  state_getRuntimeVersion: async (context, [hash]) => {
    const block = await context.chain.getBlock(hash)
    return block?.runtimeVersion
  },
  state_getMetadata: async (context, [hash]) => {
    const block = await context.chain.getBlock(hash)
    return block?.metadata
  },
  state_getStorage: async (context, [key, hash]) => {
    const block = await context.chain.getBlock(hash)
    return block?.get(key)
  },
  state_getKeysPaged: async (context, [prefix, pageSize, startKey, hash]) => {
    const block = await context.chain.getBlock(hash)
    return block?.getKeysPaged({ prefix, pageSize, startKey })
  },
  state_queryStorageAt: async (context, [keys, hash]) => {
    const block = await context.chain.getBlock(hash)
    if (!block) {
      return []
    }
    const values = await Promise.all((keys as string[]).map(async (key) => [key, await block.get(key)]))
    return [
      {
        block: block.hash,
        changes: values,
      },
    ]
  },
  state_call: async (context, [method, data, hash]) => {
    const block = await context.chain.getBlock(hash)
    if (!block) {
      return []
    }
    return block.call(method, data)
  },
  state_subscribeRuntimeVersion: async (context, _params, { subscribe }) => {
    let update = (_block: Block) => {}
    const id = context.chain.headState.subscrubeRuntimeVersion((block) => update(block))
    const callback = subscribe('state_runtimeVersion', id)
    update = async (block) => callback(await block.runtimeVersion)
    context.chain.head.runtimeVersion.then(callback)
    return id
  },
  state_unsubscribeRuntimeVersion: async (_context, [subid], { unsubscribe }) => {
    unsubscribe(subid)
  },
  state_subscribeStorage: async (context, [keys], { subscribe }) => {
    let update = (_block: Block, _pairs: [string, string][]) => {}

    const id = await context.chain.headState.subscribeStorage(keys, (block, pairs) => update(block, pairs))
    const callback = subscribe('state_storage', id, () => context.chain.headState.unsubscribeStorage(id))

    update = async (block, pairs) => {
      logger.trace({ hash: block.hash }, 'state_subscribeStorage')
      callback({
        block: block.hash,
        changes: pairs,
      })
    }
    ;(async () => {
      const pairs = await Promise.all(
        (keys as string[]).map(async (key) => {
          const val = await context.chain.head.get(key)
          return [key, val]
        })
      )
      callback({
        block: context.chain.head.hash,
        changes: pairs,
      })
    })()

    return id
  },
  state_unsubscribeStorage: async (_context, [subid], { unsubscribe }) => {
    unsubscribe(subid)
  },
}

export default handlers
