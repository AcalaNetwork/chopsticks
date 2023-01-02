import { Handlers, ResponseError } from './shared'
import { HexString } from '@polkadot/util/types'
import { StorageValues, setStorage } from '../utils/set-storage'
import { defaultLogger } from '../logger'
import { timeTravel } from '../utils/time-travel'

const logger = defaultLogger.child({ name: 'rpc-dev' })

const handlers: Handlers = {
  dev_newBlock: async (context, [param]) => {
    const { count, to } = param || {}
    const now = context.chain.head.number
    const diff = to ? to - now : count
    const finalCount = diff > 0 ? diff : 1

    let finalHash: string | undefined

    for (let i = 0; i < finalCount; i++) {
      const block = await context.chain.newBlock()
      logger.debug({ hash: block.hash }, 'dev_newBlock')
      finalHash = block.hash
    }

    return finalHash
  },
  dev_setStorages: async (context, params) => {
    const [values, blockHash] = params as [StorageValues, HexString?]
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
  dev_timeTravel: async (context, [date]) => {
    const timestamp = typeof date === 'string' ? Date.parse(date) : date
    if (Number.isNaN(timestamp)) throw new ResponseError(1, 'Invalid date')
    await timeTravel(context.chain, timestamp)
    return timestamp
  },
}

export default handlers
