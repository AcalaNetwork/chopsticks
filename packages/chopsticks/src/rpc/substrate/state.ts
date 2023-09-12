import { Block, isChild, mergeKey, stripChild } from '@acala-network/chopsticks-core'
import { Handlers, ResponseError } from '../shared'
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
      throw new ResponseError(1, `Block ${hash} not found`)
    }
    const resp = await block.call(method, [data])
    return resp.result
  },
  state_subscribeRuntimeVersion: async (context, _params, { subscribe }) => {
    let update = (_block: Block) => {}
    const id = await context.chain.headState.subscrubeRuntimeVersion((block) => update(block))
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
        }),
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
  childstate_getStorage: async (context, [child, key, hash]) => {
    if (!isChild(child)) {
      throw new ResponseError(-32000, 'Client error: Invalid child storage key')
    }
    const block = await context.chain.getBlock(hash)
    return block?.get(mergeKey(child, key))
  },
  childstate_getKeysPaged: async (context, [child, prefix, pageSize, startKey, hash]) => {
    if (!isChild(child)) {
      throw new ResponseError(-32000, 'Client error: Invalid child storage key')
    }
    const block = await context.chain.getBlock(hash)
    return block
      ?.getKeysPaged({ prefix: mergeKey(child, prefix), pageSize, startKey: mergeKey(child, startKey) })
      .then((keys) => keys.map(stripChild))
  },
}

export default handlers
