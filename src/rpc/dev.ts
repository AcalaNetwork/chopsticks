import { Handlers, ResponseError } from './shared'
import { defaultLogger } from '../logger'

const logger = defaultLogger.child({ name: 'rpc-dev' })

const handlers: Handlers = {
  dev_newBlock: async (context, _params) => {
    const block = await context.chain.newBlock()
    logger.debug({ hash: block.hash }, 'dev_newBlock')
    return block.hash
  },
  dev_setStorages: async (context, [values, blockHash]) => {
    const block = await context.chain.getBlock(blockHash)
    if (!block) {
      throw new ResponseError(1, `Block ${blockHash} not found`)
    }
    logger.debug(
      {
        hash: block.hash,
        values,
      },
      'dev_setStorages'
    )
    block.pushStorageLayer().setAll(values)
    return block.hash
  },
}

export default handlers
