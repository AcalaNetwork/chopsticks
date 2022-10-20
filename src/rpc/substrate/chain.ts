import { Handlers, ResponseError, randomId } from '../shared'

const handlers: Handlers = {
  chain_getBlockHash: async (context, params) => {
    const [blockNumber] = params
    const blockHash = await context.api.rpc.chain.getBlockHash(blockNumber)
    return blockHash.toHex()
  },
  chain_getHeader: async (context, [hash]) => {
    return (await context.chain.getBlock(hash))?.header
  },
  chain_getBlock: async (context, [hash]) => {
    const block = await context.chain.getBlock(hash)
    if (!block) {
      throw new ResponseError(1, 'Block not found')
    }
    return {
      block: {
        header: await block.header,
        extrinsics: await block.extrinsics,
      },
      justifications: null,
    }
  },
  chain_subscribeNewHead: async (context, _params, { subscribe }) => {
    const id = randomId()
    const callback = subscribe('chain_newHead', id)
    // TODO: actually subscribe to head
    callback(await context.chain.head.header)
    return id
  },
  chain_unsubscribeNewHead: async (_context, [subid], { unsubscribe }) => {
    unsubscribe(subid)
  },
}

const alias = {
  chain_subscribeNewHeads: handlers.chain_subscribeNewHead,
  chain_unsubscribeNewHeads: handlers.chain_unsubscribeNewHead,
}

export default {
  ...handlers,
  ...alias,
}
