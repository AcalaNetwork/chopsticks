import { HexString } from '@polkadot/util/types'

import { Blockchain } from './blockchain'
import { defaultLogger, truncate } from './logger'

const logger = defaultLogger.child({ name: 'binding' })

export const setupBindings = (chain: Blockchain) => {
  global._chopsticks_binding_ = {
    getStorage: async function (blockHash: HexString, key: HexString) {
      const block = await chain.getBlock(blockHash)
      if (!block) throw Error(`Block not found ${blockHash}`)
      const value = await block.get(key)
      logger.info({ blockHash, key, value: value && truncate(value) }, 'exec_storageGet')
      return value
    },
    getPrefixKeys: async function (blockHash: HexString, key: HexString) {
      const block = await chain.getBlock(blockHash)
      if (!block) throw Error(`Block not found ${blockHash}`)
      return block.getKeysPaged({ prefix: key, pageSize: 1000, startKey: key })
    },
    getNextKey: async function (blockHash: HexString, key: HexString) {
      const block = await chain.getBlock(blockHash)
      if (!block) throw Error(`Block not found ${blockHash}`)
      const keys = await block.getKeysPaged({ prefix: key, pageSize: 1, startKey: key })
      return keys.length > 0 ? keys[0] : '0x'
    },
  }
}
