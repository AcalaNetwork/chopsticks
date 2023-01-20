import { Handlers, ResponseError } from '../shared'

const handlers: Handlers = {
  chain_getBlockHash: async (context, [blockNumber]) => {
    const block = await context.chain.getBlockAt(blockNumber)
    if (!block) {
      throw new ResponseError(1, `Block #${blockNumber} not found`)
    }
    return block.hash
  },
  chain_getHeader: async (context, [hash]) => {
    const block = await context.chain.getBlock(hash)
    if (!block) {
      throw new ResponseError(1, `Block ${hash} not found`)
    }
    return await block.header
  },
  chain_getBlock: async (context, [hash]) => {
    const block = await context.chain.getBlock(hash)
    if (!block) {
      throw new ResponseError(1, `Block ${hash} not found`)
    }
    return {
      block: {
        header: await block.header,
        extrinsics: await block.extrinsics,
      },
      justifications: null,
    }
  },
  chain_getFinalizedHead: async (context) => {
    return context.chain.head.hash
  },
  chain_subscribeNewHead: async (context, _params, { subscribe }) => {
    let update = () => {}

    const id = context.chain.headState.subscribeHead(() => update())
    const callback = subscribe('chain_newHead', id, () => context.chain.headState.unsubscribeHead(id))

    update = async () => {
      callback(await context.chain.head.header)
    }

    update()

    return id
  },
  chain_subscribeFinalizedHeads: async (context, _params, { subscribe }) => {
    let update = () => {}

    const id = context.chain.headState.subscribeHead(() => update())
    const callback = subscribe('chain_newFinalizedHead', id, () => context.chain.headState.unsubscribeHead(id))

    update = async () => {
      callback(await context.chain.head.header)
    }

    update()

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
