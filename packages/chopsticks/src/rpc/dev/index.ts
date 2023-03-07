import { HexString } from '@polkadot/util/types'
import _ from 'lodash'

import { Block } from '../../blockchain/block'
import { Handlers, ResponseError } from '../shared'
import { StorageValues, setStorage } from '../../utils/set-storage'
import { defaultLogger } from '../../logger'
import { dev_dryRun } from './dry-run'
import { timeTravel } from '../../utils/time-travel'

const logger = defaultLogger.child({ name: 'rpc-dev' })

const handlers: Handlers = {
  dev_newBlock: async (context, [param]) => {
    const { count, to, hrmp, ump, dmp, transactions } = param || {}
    const now = context.chain.head.number
    const diff = to ? to - now : count
    const finalCount = diff > 0 ? diff : 1

    let finalHash: string | undefined

    for (let i = 0; i < finalCount; i++) {
      const block = await context.chain
        .newBlock({
          transactions,
          horizontalMessages: hrmp,
          upwardMessages: ump,
          downwardMessages: dmp,
        })
        .catch((error) => {
          throw new ResponseError(1, error.toString())
        })
      logger.debug({ hash: block.hash }, 'dev_newBlock')
      finalHash = block.hash
    }

    return finalHash
  },
  dev_setStorage: async (context, params) => {
    const [values, blockHash] = params as [StorageValues, HexString?]
    const hash = await setStorage(context.chain, values, blockHash).catch((error) => {
      throw new ResponseError(1, error.toString())
    })
    logger.debug(
      {
        hash,
        values,
      },
      'dev_setStorage'
    )
    return hash
  },
  dev_timeTravel: async (context, [date]) => {
    const timestamp = typeof date === 'string' ? Date.parse(date) : date
    if (Number.isNaN(timestamp)) throw new ResponseError(1, 'Invalid date')
    await timeTravel(context.chain, timestamp)
    return timestamp
  },
  dev_setHead: async (context, [hashOrNumber]) => {
    let block: Block | undefined
    if (typeof hashOrNumber === 'number') {
      const blockNumber = hashOrNumber > 0 ? hashOrNumber : context.chain.head.number + hashOrNumber
      block = await context.chain.getBlockAt(blockNumber)
    } else {
      block = await context.chain.getBlock(hashOrNumber)
    }
    if (!block) {
      throw new ResponseError(1, `Block not found ${hashOrNumber}`)
    }
    await context.chain.setHead(block)
    return block.hash
  },
  dev_dryRun,
}

export default handlers
