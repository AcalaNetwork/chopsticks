import { BuildBlockMode, Context, ResponseError } from '@acala-network/chopsticks-core'
import { defaultLogger } from '../../logger.js'

/**
 * Set a build block mode. See [BuildBlockMode](../core/enums/BuildBlockMode).
 *
 * 1 - Batch, 2 - Instant, 3 - Manual
 *
 * This function is a dev rpc handler. Use `dev_setBlockBuildMode` as the method name when calling it.
 *
 * @param context - The context object of the rpc handler
 * @param params - The parameters of the rpc handler
 *
 * @example Set build block mode to instant
 * ```ts
 * import { WsProvider } from '@polkadot/rpc-provider'
 * import { BuildBlockMode } from '@acala-network/chopsticks-core'
 * const ws = new WsProvider(`ws://localhost:8000`)
 * await ws.send('dev_setBlockBuildMode', [BuildBlockMode.Instant])
 * ```
 */
export const rpc = async (context: Context, [mode]: [BuildBlockMode]) => {
  defaultLogger.debug({ mode: BuildBlockMode[mode] }, 'dev_setBlockBuildMode')

  if (BuildBlockMode[mode] === undefined) {
    throw new ResponseError(1, `Invalid mode ${mode}`)
  }

  context.chain.txPool.mode = mode
}
