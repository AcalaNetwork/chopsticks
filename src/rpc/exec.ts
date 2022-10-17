import { stringToHex } from '@polkadot/util'

import { Handlers } from './shared'
import { fetchKeysToArray } from './fetch-keys'

const handlers: Handlers = {
  exec_storageGet: async (context, params) => {
    const [blockHash, key] = params
    return context.state.get(blockHash, key)
  },
  exec_prefixKeys: async (context, params) => {
    const [blockHash, key] = params
    const res = await fetchKeysToArray((startKey) => context.api.rpc.state.getKeysPaged(key, 500, startKey, blockHash))
    return res.map((k) => k.toHex())
  },
  exec_nextKey: async (context, params) => {
    const [blockHash, key] = params
    const res = await context.api.rpc.state.getKeysPaged(key, 1, null, blockHash)
    return res[0]?.toHex()
  },
  exec_getTask: async (context) => {
    const wasmKey = stringToHex(':code')
    const header = await context.api.rpc.chain.getHeader()
    const head = header.hash.toHex()
    const parent = header.parentHash.toHex()
    const wasm = (await context.api.rpc.state.getStorage(wasmKey, parent)) as any
    const block = await context.api.rpc.chain.getBlock(head)
    const params = block.block.toHex()
    return {
      wasm,
      call: 'Core_execute_block',
      params,
      blockHash: parent,
    }
  },
}

export default handlers
