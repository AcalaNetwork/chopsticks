import { Context, Handlers, ResponseError, SubscriptionManager, logger } from './shared'
import { pluginHandlers } from '../plugins'
import substrate from './substrate'

const allHandlers: Handlers = {
  ...substrate,
  rpc_methods: async () =>
    Promise.resolve({
      version: 1,
      methods: [...Object.keys(allHandlers), ...Object.keys(pluginHandlers)],
    }),
}

const getHandler = (method: string) => {
  const handler = allHandlers[method]
  if (!handler) {
    // no handler for this method, check if it's a plugin
    return pluginHandlers[method]
  }
  return handler
}

export const handler =
  (context: Context) =>
  ({ method, params }: { method: string; params: any[] }, subscriptionManager: SubscriptionManager) => {
    logger.trace('Handling %s', method)

    const handler = getHandler(method)

    if (!handler) {
      logger.warn('Method not found %s', method)
      throw new ResponseError(-32601, `Method not found: ${method}`)
    }

    return handler(context, params, subscriptionManager)
  }
