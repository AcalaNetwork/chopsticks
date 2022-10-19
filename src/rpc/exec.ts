import { stringToHex } from '@polkadot/util'

import { Handlers } from './shared'
import { fetchKeysToArray } from './fetch-keys'

const handlers: Handlers = {
  exec_storageGet: async (context, params) => {
    const [blockHash, key] = params
    const block = await context.chain.getBlock(blockHash)
    if (!block) {
      throw new Error('Block not found')
    }
    const value = await block.get(key)
    return value
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
    const header = await context.chain.head.header
    const parent = header.parentHash.toHex()
    const wasm = await context.chain.head.get(wasmKey)
    const block = context.chain.head

    const calls = [['Core_initialize_block', header.toHex()]]

    for (const extrinsic of await block.extrinsics) {
      calls.push(['BlockBuilder_apply_extrinsic', extrinsic])
    }

    calls.push(['BlockBuilder_finalize_block', '0x'])

    return {
      wasm,
      blockHash: parent,
      calls,
    }
  },
  exec_taskResult: async (context, params) => {
    void context
    console.log(params)
  },
}

export default handlers
