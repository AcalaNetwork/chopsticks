import { compactStripLength, hexToU8a, u8aToHex } from '@polkadot/util'

import { Handlers, randomId } from '../shared'

const handlers: Handlers = {
  state_getRuntimeVersion: async (context, [hash]) => {
    return (await context.chain.getBlock(hash))?.runtimeVersion
  },
  state_getMetadata: async (context) => {
    const metadata = await context.chain.head.metadata
    return u8aToHex(compactStripLength(hexToU8a(metadata))[1])
  },
  state_getStorage: async (context, [key, hash]) => {
    return (await context.chain.getBlock(hash))?.get(key)
  },
  state_getKeysPaged: async (context, [prefix, pageSize, startKey, hash]) => {
    return (await context.chain.getBlock(hash))?.getKeysPaged({ prefix, pageSize, startKey })
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
    const id = randomId()
    const callback = subscribe('state_runtimeVersion', id)
    // TODO: actually subscribe
    context.chain.head.runtimeVersion.then(callback)
    return id
  },
  state_unsubscribeRuntimeVersion: async (_context, [subid], { unsubscribe }) => {
    unsubscribe(subid)
  },
  state_subscribeStorage: async (context, [keys], { subscribe }) => {
    const id = randomId()
    const callback = subscribe('state_storage', id)
    // TODO: actually subscribe

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
