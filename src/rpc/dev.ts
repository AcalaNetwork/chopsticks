import { Handlers } from './shared'
import { defaultLogger } from '../logger'

const logger = defaultLogger.child({ name: 'rpc-dev' })

const handlers: Handlers = {
  dev_newBlock: async (context, _params) => {
    const block = await context.chain.newBlock()
    logger.debug({ hash: block.hash }, 'dev_newBlock')
    return block.hash
  },
}

export default handlers
