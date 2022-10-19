import { Context, Handlers, ResponseError, SubscriptionManager, logger } from './shared'
import exec from './exec'
import substrate from './substrate'

const allHandlers: Handlers = {
  ...exec,
  ...substrate,
}

export const handler =
  (context: Context) =>
  ({ method, params }: { method: string; params: string[] }, subscriptionManager: SubscriptionManager) => {
    logger.debug('Handling %s', method)

    const handler = allHandlers[method]
    if (!handler) {
      logger.debug('Method %s not found', method)
      throw new ResponseError(-32601, 'Method not found')
    }

    return handler(context, params, subscriptionManager)
  }
