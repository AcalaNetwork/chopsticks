import { BuildBlockMode } from '../blockchain/txpool'
import { Handler, ResponseError } from '../rpc/shared'
import { logger } from '.'

export const dev_setBlockBuildMode: Handler = async (context, [mode]) => {
  logger.debug({ mode }, 'dev_setBlockBuildMode')

  if (BuildBlockMode[mode] === undefined) {
    throw new ResponseError(1, `Invalid mode ${mode}`)
  }

  context.chain.txPool.mode = mode
}
