import { HexString } from '@polkadot/util/types'

import { Handler, ResponseError } from '../rpc/shared'
import { StorageValues, setStorage } from '../utils/set-storage'
import { logger } from '.'

export const dev_setStorage: Handler = async (context, params) => {
  const [values, blockHash] = params as [StorageValues, HexString?]
  const hash = await setStorage(context.chain, values, blockHash).catch((error) => {
    throw new ResponseError(1, error.toString())
  })
  logger.debug(
    {
      hash,
      values,
    },
    'dev_setStorage',
  )
  return hash
}
