import { Context, ResponseError } from '../shared.js'
import { defaultLogger } from '../../logger.js'

/**
 * Set runtime log level.
 *
 * This function is a dev rpc handler. Use `dev_setRuntimeLogLevel` as the method name when calling it.
 *
 * @param context - The context object of the rpc handler
 * @param runtimeLogLevel - The runtime log level to set
 *
 * @example Set runtime log level to 1
 * ```ts
 * import { WsProvider } from '@polkadot/rpc-provider'
 * const ws = new WsProvider(`ws://localhost:8000`)
 * await ws.send('dev_setRuntimeLogLevel', [1])
 * ```
 */
export const dev_setRuntimeLogLevel = async (context: Context, [runtimeLogLevel]: [number]) => {
  defaultLogger.debug({ runtimeLogLevel }, 'dev_setRuntimeLogLevel')

  if (typeof runtimeLogLevel !== 'number') {
    throw new ResponseError(1, `Invalid runtimeLogLevel ${runtimeLogLevel}`)
  }

  context.chain.runtimeLogLevel = runtimeLogLevel
}
