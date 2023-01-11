import { HexString } from '@polkadot/util/types'

import { Handlers, ResponseError } from './shared'
import { StorageValues, setStorage } from '../utils/set-storage'
import { decodeStorageDiff } from '../utils/decoder'
import { defaultLogger } from '../logger'
import { generateHtmlDiff } from '../utils/generate-html-diff'
import { timeTravel } from '../utils/time-travel'

const logger = defaultLogger.child({ name: 'rpc-dev' })

const handlers: Handlers = {
  dev_newBlock: async (context, [param]) => {
    const { count, to, hrmp } = param || {}
    const now = context.chain.head.number
    const diff = to ? to - now : count
    const finalCount = diff > 0 ? diff : 1

    let finalHash: string | undefined

    for (let i = 0; i < finalCount; i++) {
      const block = await context.chain.newBlock({ inherent: { horizontalMessages: hrmp } }).catch((error) => {
        throw new ResponseError(1, error.toString())
      })
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
  dev_dryRun: async (context, [{ html, extrinsic, hrmp, raw }]) => {
    const dryRun = async () => {
      if (extrinsic) {
        const { outcome, storageDiff } = await context.chain.dryRunExtrinsic(extrinsic)
        if (outcome.isErr) {
          throw new Error(outcome.asErr.toString())
        }
        return storageDiff
      }
      return context.chain.dryRunHrmp(hrmp)
    }
    const storageDiff = await dryRun()
    if (html) {
      return generateHtmlDiff(context.chain.head, storageDiff)
    }
    if (raw) {
      return storageDiff
    }
    const [oldData, newData, delta] = await decodeStorageDiff(context.chain.head, storageDiff)
    return {
      old: oldData,
      new: newData,
      delta,
    }
  },
}

export default handlers
