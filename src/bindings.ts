import { HexString } from '@polkadot/util/types'

import { Blockchain } from './blockchain'
import { defaultLogger, truncate } from './logger'

const logger = defaultLogger.child({ name: 'binding' })

export const setupBindings = (chain: Blockchain) => {
  global._chopsticks_binding_ = {
    getStorage: async function (blockHash: HexString, key: HexString) {
      const block = await chain.getBlock(blockHash)
      if (!block) throw Error(`Block not found ${blockHash}`)
      // TODO: cleanup and fix
      const value =
        key == '0x7a414cb008e0e61e46722aa60abdd672e071d663aecfe81953e36656ddea98c6'
          ? '0x00'
          : await block.get(key).then((x) => (x ? x : '0x'))
      logger.trace({ blockHash, key, value: truncate(value) }, 'exec_storageGet')
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
