import { Context, Handlers, ResponseError, logger } from './shared'
import runner from './runner'

const allHandlers: Handlers = {
  ...runner,
}

export const handler =
  (context: Context) =>
  ({ method, params }: { method: string; params: string[] }) => {
    logger.debug('Handling %s with params %o', method, params)

    const handler = allHandlers[method]
    if (!handler) {
      logger.debug('Method %s not found', method)
      throw new ResponseError(-32601, 'Method not found')
    }

    return handler(context, params)
  }
