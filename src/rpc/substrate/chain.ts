import { Handlers } from '../shared'

const handlers: Handlers = {
  chain_getBlockHash: async (context, params) => {
    const [blockNumber] = params
    const blockHash = await context.api.rpc.chain.getBlockHash(blockNumber)
    return blockHash.toHex()
  },
}

export default handlers
