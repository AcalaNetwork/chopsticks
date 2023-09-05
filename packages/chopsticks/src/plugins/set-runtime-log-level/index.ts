import { Handler, ResponseError } from '../../rpc/shared'
import { defaultLogger } from '../../logger'

export const rpc: Handler = async (context, [runtimeLogLevel]) => {
  defaultLogger.debug({ runtimeLogLevel }, 'dev_setRuntimeLogLevel')

  if (typeof runtimeLogLevel !== 'number' || runtimeLogLevel < 0 || runtimeLogLevel > 5) {
    throw new ResponseError(1, `Invalid runtimeLogLevel ${runtimeLogLevel}`)
  }

  context.chain.runtimeLogLevel = runtimeLogLevel

  defaultLogger.debug(`Runtime log level set to ${runtimeLogLevel}`)
}
