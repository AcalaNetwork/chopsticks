import { Context, ResponseError, SubscriptionManager } from '../shared'
import { Header } from '@polkadot/types/interfaces'
import { HexString } from '@polkadot/util/types'

const processHeader = (header: Header) => {
  const res = header.toJSON() as any
  res.number = '0x' + res.number.toString(16) // number is hex format
  return res
}

export interface ChainHandlers {
  /**
   * @param {Context} context
   * @param params - [`blockNumber`]
   */
  chain_getBlockHash: (context: Context, [blockNumber]: [number]) => Promise<HexString>
  /**
   * @param {Context} context
   * @param params - [`hash`]
   */
  chain_getHeader: (context: Context, [hash]: [HexString]) => Promise<Header>
  /**
   * @param {Context} context
   * @param params - [`hash`]
   */
  chain_getBlock: (context: Context, [hash]: [HexString]) => Promise<object>
  chain_getFinalizedHead: (context: Context) => Promise<HexString>
  chain_subscribeNewHead: (context: Context, _params: [], subscriptionManager: SubscriptionManager) => Promise<string>
  chain_subscribeFinalizedHeads: (
    context: Context,
    _params: [],
    subscriptionManager: SubscriptionManager,
  ) => Promise<string>
  /**
   * @param {Context} context
   * @param params - [`subid`]
   * @param {SubscriptionManager} subscriptionManager
   */
  chain_unsubscribeNewHead: (
    context: Context,
    [subid]: [string],
    subscriptionManager: SubscriptionManager,
  ) => Promise<void>
}

/**
 * Substrate `chain` RPC methods, see {@link ChainHandlers} for methods details.
 */
export const handlers: ChainHandlers = {
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
    return processHeader(await block.header)
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
      callback(processHeader(await context.chain.head.header))
    }

    update()

    return id
  },
  chain_subscribeFinalizedHeads: async (context, _params, { subscribe }) => {
    let update = () => {}

    const id = context.chain.headState.subscribeHead(() => update())
    const callback = subscribe('chain_finalizedHead', id, () => context.chain.headState.unsubscribeHead(id))

    update = async () => {
      callback(processHeader(await context.chain.head.header))
    }

    update()

    return id
  },
  chain_unsubscribeNewHead: async (_context, [subid], { unsubscribe }) => {
    unsubscribe(subid)
  },
}

export interface ChainHandlersAlias {
  chain_subscribeNewHeads: (context: Context, _params: [], subscriptionManager: SubscriptionManager) => Promise<string>
  /**
   * @param {Context} context
   * @param params - [`subid`]
   * @param {SubscriptionManager} subscriptionManager
   */
  chain_unsubscribeNewHeads: (
    context: Context,
    [subid]: [string],
    subscriptionManager: SubscriptionManager,
  ) => Promise<void>
  /**
   * @param {Context} context
   * @param params - [`subid`]
   * @param {SubscriptionManager} subscriptionManager
   */
  chain_unsubscribeFinalizedHeads: (
    context: Context,
    [subid]: [string],
    subscriptionManager: SubscriptionManager,
  ) => Promise<void>
}

const alias: ChainHandlersAlias = {
  chain_subscribeNewHeads: handlers.chain_subscribeNewHead,
  chain_unsubscribeNewHeads: handlers.chain_unsubscribeNewHead,
  chain_unsubscribeFinalizedHeads: handlers.chain_unsubscribeNewHead,
}

export default {
  ...handlers,
  ...alias,
}
