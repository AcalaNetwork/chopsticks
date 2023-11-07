import { Handlers } from './shared.js'
import substrate from './substrate/index.js'

export const allHandlers: Handlers = {
  ...substrate,
  rpc_methods: async () =>
    Promise.resolve({
      version: 1,
      methods: [...Object.keys(allHandlers)],
    }),
}

export { default as substrate } from './substrate/index.js'
export { ResponseError } from './shared.js'
export type { Context, SubscriptionManager, Handler, Handlers } from './shared.js'
