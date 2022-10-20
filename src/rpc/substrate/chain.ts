import { Handlers, randomId } from '../shared'

const handlers: Handlers = {
  chain_getBlockHash: async (context, params) => {
    const [blockNumber] = params
    const blockHash = await context.api.rpc.chain.getBlockHash(blockNumber)
    return blockHash.toHex()
  },
  chain_subscribeNewHeads: async (context, _params, { subscribe }) => {
    const id = randomId()
    const callback = subscribe('chain_newHead', id)
    // TODO: actually subscribe to head
    callback(await context.chain.head.header)
    return id
  },
  chain_unsubscribeNewHeads: async (_context, [subid], { unsubscribe }) => {
    unsubscribe(subid)
  },
}

export default handlers
