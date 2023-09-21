import {
  Block,
  RuntimeVersion,
  isPrefixedChildKey,
  prefixedChildKey,
  stripChildPrefix,
} from '@acala-network/chopsticks-core'
import { HexString } from '@polkadot/util/types'

import { Context, ResponseError, SubscriptionManager } from '../shared'
import { defaultLogger } from '../../logger'

const logger = defaultLogger.child({ name: 'rpc-state' })

export interface StateHandlers {
  /**
   * @param {Context} context
   * @param params - [`hash`]
   */
  state_getRuntimeVersion: (context: Context, [hash]: [HexString]) => Promise<RuntimeVersion | undefined>
  /**
   * @param {Context} context
   * @param params - [`hash`]
   */
  state_getMetadata: (context: Context, [hash]: [HexString]) => Promise<HexString | undefined>
  /**
   * @param {Context} context
   * @param params - [`key`, `hash`]
   */
  state_getStorage: (context: Context, [key, hash]: [HexString, HexString]) => Promise<string | undefined>
  /**
   * @param {Context} context
   * @param params - [`prefix`, `pageSize`, `startKey`, `hash`]
   */
  state_getKeysPaged: (
    context: Context,
    [prefix, pageSize, startKey, hash]: [HexString, number, HexString, HexString],
  ) => Promise<string[] | undefined>
  /**
   * @param {Context} context
   * @param params - [`keys`, `hash`]
   */
  state_queryStorageAt: (
    context: Context,
    [keys, hash]: [HexString[], HexString],
  ) => Promise<
    | []
    | [
        {
          block: HexString
          changes: (string | undefined)[][]
        },
      ]
  >
  /**
   * @param {Context} context
   * @param params - [`method`, `data`, `hash`]
   */
  state_call: (context: Context, [method, data, hash]: [string, HexString, HexString]) => Promise<HexString>
  state_subscribeRuntimeVersion: (
    context: Context,
    _params: [],
    subscriptionManager: SubscriptionManager,
  ) => Promise<string>
  /**
   * @param {Context} context
   * @param params - [`subid`]
   * @param {SubscriptionManager} subscriptionManager
   */
  state_unsubscribeRuntimeVersion: (
    context: Context,
    [subid]: [string],
    subscriptionManager: SubscriptionManager,
  ) => Promise<void>
  /**
   * @param {Context} context
   * @param params - [`keys`]
   * @param {SubscriptionManager} subscriptionManager
   */
  state_subscribeStorage: (
    context: Context,
    [keys]: [HexString[]],
    subscriptionManager: SubscriptionManager,
  ) => Promise<string>
  /**
   * @param {Context} context
   * @param params - [`subid`]
   * @param {SubscriptionManager} subscriptionManager
   */
  state_unsubscribeStorage: (
    context: Context,
    [subid]: [string],
    subscriptionManager: SubscriptionManager,
  ) => Promise<void>
  /**
   * @param {Context} context
   * @param params - [`child`, `key`, `hash`]
   */
  childstate_getStorage: (
    context: Context,
    [child, key, hash]: [HexString, HexString, HexString],
  ) => Promise<string | undefined>
  /**
   * @param {Context} context
   * @param params - [`child`, `prefix`, `pageSize`, `startKey`, `hash`]
   */
  childstate_getKeysPaged: (
    context: Context,
    [child, prefix, pageSize, startKey, hash]: [HexString, HexString, number, HexString, HexString],
  ) => Promise<HexString[] | undefined>
}

/**
 * Substrate `state` RPC methods, see {@link StateHandlers} for methods details.
 */
const handlers: StateHandlers = {
  state_getRuntimeVersion: async (context, [hash]) => {
    const block = await context.chain.getBlock(hash)
    return block?.runtimeVersion
  },
  state_getMetadata: async (context, [hash]) => {
    const block = await context.chain.getBlock(hash)
    return block?.metadata
  },
  state_getStorage: async (context, [key, hash]) => {
    const block = await context.chain.getBlock(hash)
    return block?.get(key)
  },
  state_getKeysPaged: async (context, [prefix, pageSize, startKey, hash]) => {
    const block = await context.chain.getBlock(hash)
    return block?.getKeysPaged({ prefix, pageSize, startKey })
  },
  state_queryStorageAt: async (context, [keys, hash]) => {
    const block = await context.chain.getBlock(hash)
    if (!block) {
      return []
    }
    const values = await Promise.all((keys as string[]).map(async (key) => [key, await block.get(key)]))
    return [
      {
        block: block.hash,
        changes: values,
      },
    ]
  },
  state_call: async (context, [method, data, hash]) => {
    const block = await context.chain.getBlock(hash)
    if (!block) {
      throw new ResponseError(1, `Block ${hash} not found`)
    }
    const resp = await block.call(method, [data])
    return resp.result
  },
  state_subscribeRuntimeVersion: async (context, _params, { subscribe }) => {
    let update = (_block: Block) => {}
    const id = await context.chain.headState.subscrubeRuntimeVersion((block) => update(block))
    const callback = subscribe('state_runtimeVersion', id)
    update = async (block) => callback(await block.runtimeVersion)
    context.chain.head.runtimeVersion.then(callback)
    return id
  },
  state_unsubscribeRuntimeVersion: async (_context, [subid], { unsubscribe }) => {
    unsubscribe(subid)
  },
  state_subscribeStorage: async (context, [keys], { subscribe }) => {
    let update = (_block: Block, _pairs: [string, string][]) => {}

    const id = await context.chain.headState.subscribeStorage(keys, (block, pairs) => update(block, pairs))
    const callback = subscribe('state_storage', id, () => context.chain.headState.unsubscribeStorage(id))

    update = async (block, pairs) => {
      logger.trace({ hash: block.hash }, 'state_subscribeStorage')
      callback({
        block: block.hash,
        changes: pairs,
      })
    }
    ;(async () => {
      const pairs = await Promise.all(
        (keys as string[]).map(async (key) => {
          const val = await context.chain.head.get(key)
          return [key, val]
        }),
      )
      callback({
        block: context.chain.head.hash,
        changes: pairs,
      })
    })()

    return id
  },
  state_unsubscribeStorage: async (_context, [subid], { unsubscribe }) => {
    unsubscribe(subid)
  },
  childstate_getStorage: async (context, [child, key, hash]) => {
    if (!isPrefixedChildKey(child)) {
      throw new ResponseError(-32000, 'Client error: Invalid child storage key')
    }
    const block = await context.chain.getBlock(hash)
    return block?.get(prefixedChildKey(child, key))
  },
  childstate_getKeysPaged: async (context, [child, prefix, pageSize, startKey, hash]) => {
    if (!isPrefixedChildKey(child)) {
      throw new ResponseError(-32000, 'Client error: Invalid child storage key')
    }
    const block = await context.chain.getBlock(hash)
    return block
      ?.getKeysPaged({ prefix: prefixedChildKey(child, prefix), pageSize, startKey: prefixedChildKey(child, startKey) })
      .then((keys: any[]) => keys.map(stripChildPrefix))
  },
}

export default handlers
