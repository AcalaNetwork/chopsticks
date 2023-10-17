import { Handlers } from './shared'
import substrate from './substrate'

export const allHandlers: Handlers = {
  ...substrate,
  rpc_methods: async () =>
    Promise.resolve({
      version: 1,
      methods: [...Object.keys(allHandlers)],
    }),
}

export { default as substrate } from './substrate'
export { ResponseError } from './shared'
export type { Context, SubscriptionManager, Handler, Handlers } from './shared'
