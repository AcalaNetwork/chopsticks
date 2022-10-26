import { Context, Handlers, ResponseError, SubscriptionManager, logger } from './shared'
import dev from './dev'
import exec from './exec'
import substrate from './substrate'

const allHandlers: Handlers = {
  ...exec,
  ...substrate,
  ...dev,
}

export const handler =
  (context: Context) =>
  ({ method, params }: { method: string; params: string[] }, subscriptionManager: SubscriptionManager) => {
    logger.trace('Handling %s', method)

    const handler = allHandlers[method]
    if (!handler) {
      logger.warn('Method %s not found', method)
      throw new ResponseError(-32601, 'Method not found')
    }

    return handler(context, params, subscriptionManager)
  }
