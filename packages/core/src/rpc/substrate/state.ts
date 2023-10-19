import { Block } from '../../blockchain/block'
import { HexString } from '@polkadot/util/types'

import { Handler, ResponseError } from '../shared'
import { RuntimeVersion } from '../../wasm-executor'
import { defaultLogger } from '../../logger'
import { isPrefixedChildKey, prefixedChildKey, stripChildPrefix } from '../../utils'

const logger = defaultLogger.child({ name: 'rpc-state' })

/**
 * @param context
 * @param params - [`blockhash`]
 *
 * @return runtime version
 */
export const state_getRuntimeVersion: Handler<[HexString], RuntimeVersion | undefined> = async (context, [hash]) => {
  const block = await context.chain.getBlock(hash)
  return block?.runtimeVersion
}

/**
 * @param context
 * @param params - [`blockhash`]
 *
 * @return metadata
 */
export const state_getMetadata: Handler<[HexString], HexString | undefined> = async (context, [hash]) => {
  const block = await context.chain.getBlock(hash)
  return block?.metadata
}

/**
 * @param context
 * @param params - [`key`, `blockhash`]
 *
 * @return storage value
 */
export const state_getStorage: Handler<[HexString, HexString], string | undefined> = async (context, [key, hash]) => {
  const block = await context.chain.getBlock(hash)
  return block?.get(key)
}

/**
 * @param context
 * @param params - [`prefix`, `pageSize`, `startKey`, `blockhash`]
 *
 * @return paged keys
 */
export const state_getKeysPaged: Handler<[string, number, string, HexString], string[] | undefined> = async (
  context,
  [prefix, pageSize, startKey, hash],
) => {
  const block = await context.chain.getBlock(hash)
  return block?.getKeysPaged({ prefix, pageSize, startKey })
}

/**
 * @param context
 * @param params - [`keys`, `blockhash`]
 *
 * @return storage values
 */
export const state_queryStorageAt: Handler<
  [string[], HexString],
  | []
  | [
      {
        block: HexString
        changes: (string | undefined)[][]
      },
    ]
> = async (context, [keys, hash]) => {
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
}

/**
 * @param context
 * @param params - [`method`, `data`, `blockhash`]
 *
 * @return result in hash
 */
export const state_call: Handler<[HexString, HexString, HexString], HexString> = async (
  context,
  [method, data, hash],
) => {
  const block = await context.chain.getBlock(hash)
  if (!block) {
    throw new ResponseError(1, `Block ${hash} not found`)
  }
  const resp = await block.call(method, [data])
  return resp.result
}

/**
 * @return subscription id
 */
export const state_subscribeRuntimeVersion: Handler<[], string> = async (context, _params, { subscribe }) => {
  let update = (_block: Block) => {}
  const id = await context.chain.headState.subscrubeRuntimeVersion((block) => update(block))
  const callback = subscribe('state_runtimeVersion', id)
  update = async (block) => callback(await block.runtimeVersion)
  setTimeout(() => {
    context.chain.head.runtimeVersion.then(callback)
  }, 50)
  return id
}

/**
 * @param context
 * @param params - [`subid`]
 * @param subscriptionManager
 */
export const state_unsubscribeRuntimeVersion: Handler<[HexString], void> = async (
  _context,
  [subid],
  { unsubscribe },
) => {
  unsubscribe(subid)
}

/**
 * @param context
 * @param params - [`keys`]
 * @param subscriptionManager
 *
 * @return subscription id
 */
export const state_subscribeStorage: Handler<[string[]], string> = async (context, [keys], { subscribe }) => {
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
}

/**
 * @param context
 * @param params - [`subid`]
 * @param subscriptionManager
 */
export const state_unsubscribeStorage: Handler<[string], void> = async (_context, [subid], { unsubscribe }) => {
  unsubscribe(subid)
}

/**
 * @param context
 * @param params - [`child`, `key`, `blockhash`]
 *
 * @return storage valuse
 */
export const childstate_getStorage: Handler<[HexString, HexString, HexString], string | undefined> = async (
  context,
  [child, key, hash],
) => {
  if (!isPrefixedChildKey(child)) {
    throw new ResponseError(-32000, 'Client error: Invalid child storage key')
  }
  const block = await context.chain.getBlock(hash)
  return block?.get(prefixedChildKey(child, key))
}

/**
 * @param context
 * @param params - [`child`, `prefix`, `pageSize`, `startKey`, `blockhash`]
 *
 * @return paged keys
 */
export const childstate_getKeysPaged: Handler<
  [HexString, HexString, number, HexString, HexString],
  HexString[] | undefined
> = async (context, [child, prefix, pageSize, startKey, hash]) => {
  if (!isPrefixedChildKey(child)) {
    throw new ResponseError(-32000, 'Client error: Invalid child storage key')
  }
  const block = await context.chain.getBlock(hash)
  return block
    ?.getKeysPaged({ prefix: prefixedChildKey(child, prefix), pageSize, startKey: prefixedChildKey(child, startKey) })
    .then((keys: any[]) => keys.map(stripChildPrefix))
}
