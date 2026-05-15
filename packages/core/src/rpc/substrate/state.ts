import { stringToHex } from '@polkadot/util'
import type { HexString } from '@polkadot/util/types'

import type { Block } from '../../blockchain/block.js'
import { defaultLogger } from '../../logger.js'
import { isPrefixedChildKey, prefixedChildKey, stripChildPrefix } from '../../utils/index.js'
import { createProof, type RuntimeVersion } from '../../wasm-executor/index.js'
import { type Handler, ResponseError } from '../shared.js'

const logger = defaultLogger.child({ name: 'rpc-state' })

/**
 * @param context
 * @param params - [`blockhash`]
 *
 * @return runtime version
 */
export const state_getRuntimeVersion: Handler<[HexString], RuntimeVersion | null> = async (context, [hash]) => {
  const block = await context.chain.getBlock(hash)
  return block?.runtimeVersion || null
}

/**
 * @param context
 * @param params - [`blockhash`]
 *
 * @return metadata
 */
export const state_getMetadata: Handler<[HexString], HexString | null> = async (context, [hash]) => {
  const block = await context.chain.getBlock(hash)
  return block?.metadata || null
}

/**
 * @param context
 * @param params - [`key`, `blockhash`]
 *
 * @return storage value
 */
export const state_getStorage: Handler<[HexString, HexString], string | null> = async (context, [key, hash]) => {
  const block = await context.chain.getBlock(hash)
  const value = (await block?.get(key)) || null
  return value || null
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
        changes: [string, string | null][]
      },
    ]
> = async (context, [keys, hash]) => {
  const block = await context.chain.getBlock(hash)
  if (!block) {
    return []
  }
  const values = await Promise.all(
    keys.map(async (key) => [key, await block.get(key).then((val) => val || null)] as [string, string | null]),
  )
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
 * @param context
 * @param params - [`keys`, `blockhash?`]
 *
 * @return `{ at, proof }` — proof is a list of SCALE-encoded trie nodes.
 *
 * Chopsticks keeps no trie of its own: fetches a base proof from upstream and re-applies
 * chopsticks-side values via `createProof`. Falls back to upstream head for chopsticks-only
 * blocks. Verifiers should derive the expected state_root from the proof itself, not from
 * `chain_getHeader(at).state_root`, since they diverge once local overrides are applied.
 * Child-storage keys are rejected — use `state_getChildReadProof`.
 */
export const state_getReadProof: Handler<
  [HexString[], HexString | undefined],
  { at: HexString; proof: HexString[] }
> = async (context, [keys, hash]) => {
  if (keys.length === 0) {
    throw new ResponseError(-32602, 'state_getReadProof requires a non-empty array of keys')
  }
  for (const key of keys) {
    if (isPrefixedChildKey(key)) {
      throw new ResponseError(
        -32601,
        `state_getReadProof does not support child-storage keys (got ${key}); use state_getChildReadProof`,
      )
    }
  }

  const block = await context.chain.getBlock(hash)
  if (!block) {
    throw new ResponseError(1, `Block ${hash ?? 'head'} not found`)
  }

  const updates = await Promise.all(
    keys.map(async (key) => [key, (await block.get(key)) ?? null] as [HexString, HexString | null]),
  )

  // Upstream rejects chopsticks-only blocks with UnknownBlock; fall back to upstream
  // head whose trie is guaranteed available.
  let upstreamProof: { at: HexString; proof: HexString[] }
  try {
    upstreamProof = await context.chain.api.getReadProof(keys, block.hash as HexString)
  } catch (err) {
    logger.debug(
      { err: (err as Error).message, blockHash: block.hash },
      'getReadProof at block failed; retrying at head',
    )
    try {
      upstreamProof = await context.chain.api.getReadProof(keys)
    } catch (err2) {
      throw new ResponseError(
        -32603,
        `state_getReadProof: upstream rejected at block ${block.hash} and at head (${(err2 as Error).message})`,
      )
    }
  }

  const { nodes } = await createProof(upstreamProof.proof, updates)
  return { at: block.hash as HexString, proof: nodes }
}

/**
 * @return subscription id
 */
export const state_subscribeRuntimeVersion: Handler<[], string> = async (context, _params, { subscribe }) => {
  let update = (_block: Block) => {}

  const id = await context.chain.headState.subscribeStorage([stringToHex(':code')], (block) => update(block))
  const callback = subscribe('state_runtimeVersion', id, () => context.chain.headState.unsubscribeStorage(id))

  update = async (block) => callback(await block.runtimeVersion)
  ;(async () => {
    update(context.chain.head)
  })()

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
  let update = (_block: Block, _pairs: [string, string | null][]) => {}

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
    const pairs: [string, string | null][] = await Promise.all(
      (keys as string[]).map(async (key) => {
        const val = await context.chain.head.get(key)
        return [key, val || null]
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
export const childstate_getStorage: Handler<[HexString, HexString, HexString], string | null> = async (
  context,
  [child, key, hash],
) => {
  if (!isPrefixedChildKey(child)) {
    throw new ResponseError(-32000, 'Client error: Invalid child storage key')
  }
  const block = await context.chain.getBlock(hash)
  const value = await block?.get(prefixedChildKey(child, key))
  return value || null
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

export const state_getStorageAt = state_getStorage
