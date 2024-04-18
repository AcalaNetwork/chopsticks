import {
  Context,
  Handlers,
  ResponseError,
  SubscriptionManager,
  allHandlers as coreHandlers,
  defaultLogger,
} from '@acala-network/chopsticks-core'

import { loadRpcPlugin, rpcPluginMethods } from '../plugins/index.js'

const rpcLogger = defaultLogger.child({ name: 'rpc' })

const allHandlers: Handlers = {
  ...coreHandlers,
  rpc_methods: async () =>
    Promise.resolve({
      version: 1,
      methods: [...Object.keys(allHandlers), ...rpcPluginMethods].sort(),
    }),
}

const getHandler = async (method: string) => {
  const handler = allHandlers[method]
  if (!handler) {
    // no handler for this method, check if it's a plugin
    return loadRpcPlugin(method)
  }
  return handler
}

export const handler =
  (context: Context) =>
  async ({ method, params }: { method: string; params: any[] }, subscriptionManager: SubscriptionManager) => {
    rpcLogger.trace('Handling %s', method)

    const handler = await getHandler(method)

    if (!handler) {
      rpcLogger.warn('Method not found %s', method)
      throw new ResponseError(-32601, `Method not found: ${method}`)
    }

    return handler(context, params, subscriptionManager)
  }
