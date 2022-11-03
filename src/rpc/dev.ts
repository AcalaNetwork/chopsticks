import { Handlers, ResponseError } from './shared'
import { StorageValues, setStorage } from '../utils/set-storage'
import { defaultLogger } from '../logger'

const logger = defaultLogger.child({ name: 'rpc-dev' })

const handlers: Handlers = {
  dev_newBlock: async (context, _params) => {
    const block = await context.chain.newBlock()
    logger.debug({ hash: block.hash }, 'dev_newBlock')
    return block.hash
  },
  dev_setStorages: async (context, params) => {
    const [values, blockHash] = params as [StorageValues, string?]
    const hash = await setStorage(context.chain, values, blockHash).catch((error) => {
      throw new ResponseError(1, error.toString())
    })
    logger.debug(
      {
        hash,
        values,
      },
      'dev_setStorages'
    )
    return hash
  },
}

export default handlers
