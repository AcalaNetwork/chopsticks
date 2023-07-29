import { BuildBlockMode } from '@acala-network/chopsticks-core'
import { Handler, ResponseError } from '../../rpc/shared'
import { defaultLogger } from '../../logger'

export const rpc: Handler = async (context, [mode]) => {
  defaultLogger.debug({ mode }, 'dev_setBlockBuildMode')

  if (BuildBlockMode[mode] === undefined) {
    throw new ResponseError(1, `Invalid mode ${mode}`)
  }

  context.chain.txPool.mode = mode
}
