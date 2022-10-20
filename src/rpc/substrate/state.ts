import { Handlers, randomId } from '../shared'

const handlers: Handlers = {
  state_getRuntimeVersion: async (context) => {
    return context.chain.head.runtimeVersion
  },
  state_getMetadata: async (context) => {
    return context.chain.head.metadata
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
