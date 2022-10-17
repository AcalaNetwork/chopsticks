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
    const header = await context.api.rpc.chain.getHeader(context.state.head)
    const head = header.hash.toHex()
    const parent = header.parentHash.toHex()
    const wasm = (await context.api.rpc.state.getStorage(wasmKey, parent)) as any
    const block = await context.api.rpc.chain.getBlock(head)

    const calls = [['Core_initialize_block', header.toHex()]]

    for (const extrinsic of block.block.extrinsics) {
      calls.push(['BlockBuilder_apply_extrinsic', extrinsic.toHex()])
    }

    calls.push(['BlockBuilder_finalize_block', '0x'])

    return {
      wasm,
      blockHash: parent,
      calls,
    }
  },
}

export default handlers
