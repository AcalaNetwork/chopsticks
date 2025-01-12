import type { HexString } from '@polkadot/util/types'
import type { Block } from '../../blockchain/block.js'
import { defaultLogger } from '../../logger.js'
import { type Handler, ResponseError, type SubscriptionManager } from '../shared.js'

const logger = defaultLogger.child({ name: 'rpc-chainHead_v1' })

type DescendantValuesParams = {
  prefix: string
  startKey: string
}
const following = new Map<
  string,
  {
    callback: (data: any) => void
    pendingDescendantValues: Map<string, { hash: HexString; params: DescendantValuesParams[] }>
    storageDiffs: Map<HexString, number>
  }
>()

async function afterResponse(fn: () => void) {
  await new Promise((resolve) => setTimeout(resolve, 0))
  fn()
}

/**
 * Start a chainHead follow subscription
 *
 * @param context
 * @param params - [`withRuntime`]
 * @param subscriptionManager
 *
 * @return subscription id
 */
export const chainHead_v1_follow: Handler<[boolean], string> = async (
  context,
  [withRuntime],
  { subscribe }: SubscriptionManager,
) => {
  const update = async (block: Block) => {
    logger.trace({ hash: block.hash }, 'chainHead_v1_follow')

    const getNewRuntime = async () => {
      const [runtime, previousRuntime] = await Promise.all([
        block.runtimeVersion,
        block.parentBlock.then((b) => b?.runtimeVersion),
      ])
      const hasNewRuntime =
        runtime.implVersion !== previousRuntime?.implVersion || runtime.specVersion !== previousRuntime.specVersion
      return hasNewRuntime ? runtime : null
    }
    const newRuntime = withRuntime ? await getNewRuntime() : null

    callback({
      event: 'newBlock',
      blockHash: block.hash,
      parentBlockHash: (await block.parentBlock)?.hash,
      newRuntime,
    })
    callback({
      event: 'bestBlockChanged',
      bestBlockHash: block.hash,
    })
    callback({
      event: 'finalized',
      finalizedBlockHashes: [block.hash],
      prunedBlockHashes: [],
    })

    const storageDiffs = following.get(id)?.storageDiffs
    if (storageDiffs?.size) {
      // Fetch the storage diffs and update the `closestDescendantMerkleValue` for those that changed
      const diffKeys = Object.keys(await block.storageDiff())
      for (const [prefix, value] of storageDiffs.entries()) {
        if (diffKeys.some((key) => key.startsWith(prefix))) {
          storageDiffs.set(prefix, value + 1)
        }
      }
    }
  }

  const id = context.chain.headState.subscribeHead(update)

  const cleanup = () => {
    context.chain.headState.unsubscribeHead(id)
    following.delete(id)
  }

  const callback = subscribe('chainHead_v1_followEvent', id, cleanup)
  following.set(id, { callback, pendingDescendantValues: new Map(), storageDiffs: new Map() })

  afterResponse(async () => {
    callback({
      event: 'initialized',
      finalizedBlockHashes: [context.chain.head.hash],
      finalizedBlockRuntime: withRuntime ? await context.chain.head.runtimeVersion : null,
    })
  })

  return id
}

/**
 * Stop a chainHead follow subscription
 *
 * @param context
 * @param params - [`followSubscription`]
 * @param subscriptionManager
 */
export const chainHead_v1_unfollow: Handler<[string], null> = async (_, [followSubscription], { unsubscribe }) => {
  unsubscribe(followSubscription)

  return null
}

/**
 * Retrieve the header for a specific block
 *
 * @param context
 * @param params - [`followSubscription`, `hash`]
 *
 * @return SCALE-encoded header, or null if the block is not found.
 */
export const chainHead_v1_header: Handler<[string, HexString], HexString | null> = async (
  context,
  [followSubscription, hash],
) => {
  if (!following.has(followSubscription)) return null
  const block = await context.chain.getBlock(hash)

  return block ? (await block.header).toHex() : null
}

type OperationStarted = {
  result: 'started'
  operationId: string
}
const operationStarted = (operationId: string): OperationStarted => ({ result: 'started', operationId })
const randomId = () => Math.random().toString(36).substring(2)

/**
 * Perform a runtime call for a block
 *
 * @param context
 * @param params - [`followSubscription`, `hash`, `function`, `callParameters`]
 *
 * @return OperationStarted event with operationId to receive the result on the follow subscription
 */
export const chainHead_v1_call: Handler<[string, HexString, string, HexString], OperationStarted> = async (
  context,
  [followSubscription, hash, method, callParameters],
) => {
  const operationId = randomId()

  afterResponse(async () => {
    const block = await context.chain.getBlock(hash)

    if (!block) {
      following.get(followSubscription)?.callback({
        event: 'operationError',
        operationId,
        error: `Block ${hash} not found`,
      })
    } else {
      try {
        const resp = await block.call(method, [callParameters])
        following.get(followSubscription)?.callback({
          event: 'operationCallDone',
          operationId,
          output: resp.result,
        })
      } catch (ex: any) {
        following.get(followSubscription)?.callback({
          event: 'operationError',
          operationId,
          error: ex.message,
        })
      }
    }
  })

  return operationStarted(operationId)
}

export type StorageStarted = OperationStarted & { discardedItems: number }
export interface StorageItemRequest {
  key: HexString
  type: 'value' | 'hash' | 'closestDescendantMerkleValue' | 'descendantsValues' | 'descendantsHashes'
}

const PAGE_SIZE = 1000
async function getDescendantValues(
  block: Block,
  params: DescendantValuesParams,
): Promise<{
  items: Array<{
    key: string
    value?: HexString
  }>
  next: DescendantValuesParams | null
}> {
  const keys = await block.getKeysPaged({
    ...params,
    pageSize: PAGE_SIZE,
  })

  const items = await Promise.all(
    keys.map((key) =>
      block.get(key).then((value) => ({
        key,
        value,
      })),
    ),
  )

  if (keys.length < PAGE_SIZE) {
    return {
      items,
      next: null,
    }
  }

  return {
    items,
    next: {
      ...params,
      startKey: keys[PAGE_SIZE - 1],
    },
  }
}

/**
 * Query the storage for a given block
 *
 * @param context
 * @param params - [`followSubscription`, `hash`, `items`, `childTrie`]
 *
 * @return OperationStarted event with operationId to receive the result on the follow subscription
 *
 * The query type `closestDescendantMerkleValue` is not up to spec.
 * According to the spec, the result should be the Merkle value of the key or
 * the closest descendant of the key.
 * As chopsticks doesn't have direct access to the Merkle tree, it will return
 * a string that will change every time that one of the descendant changes, but
 * it won't be the actual Merkle value.
 * This should be enough for applications that don't rely on the actual Merkle
 * value, but just use it to detect for storage changes.
 */
export const chainHead_v1_storage: Handler<
  [string, HexString, StorageItemRequest[], HexString | null],
  StorageStarted
> = async (context, [followSubscription, hash, items, _childTrie]) => {
  const operationId = randomId()

  afterResponse(async () => {
    const block = await context.chain.getBlock(hash)
    if (!block) {
      following.get(followSubscription)?.callback({
        event: 'operationError',
        operationId,
        error: 'Block not found',
      })
      return
    }

    const handleStorageItemRequest = async (sir: StorageItemRequest) => {
      switch (sir.type) {
        case 'value': {
          const value = await block.get(sir.key)
          if (value) {
            following.get(followSubscription)?.callback({
              event: 'operationStorageItems',
              operationId,
              items: [{ key: sir.key, value }],
            })
          }
          return null
        }
        case 'descendantsValues': {
          const { items, next } = await getDescendantValues(block, { prefix: sir.key, startKey: '0x' })

          following.get(followSubscription)?.callback({
            event: 'operationStorageItems',
            operationId,
            items,
          })

          return next
        }
        case 'closestDescendantMerkleValue': {
          const followingSubscription = following.get(followSubscription)
          if (!followingSubscription) return null
          if (!followingSubscription.storageDiffs.has(sir.key)) {
            // Set up a diff watch for this key
            followingSubscription.storageDiffs.set(sir.key, 0)
          }

          followingSubscription.callback({
            event: 'operationStorageItems',
            operationId,
            items: [
              {
                key: sir.key,
                closestDescendantMerkleValue: String(followingSubscription.storageDiffs.get(sir.key)),
              },
            ],
          })

          return null
        }
        default:
          // TODO
          console.warn(`Storage type not implemented ${sir.type}`)
          return null
      }
    }

    const listResult = await Promise.all(items.map(handleStorageItemRequest))
    const pending = listResult.filter((v) => v !== null)

    if (!pending.length) {
      following.get(followSubscription)?.callback({
        event: 'operationStorageDone',
        operationId,
      })
    } else {
      const follower = following.get(followSubscription)
      if (follower) {
        follower.pendingDescendantValues.set(operationId, { hash, params: pending })
        follower.callback({
          event: 'operationWaitingForContinue',
          operationId,
        })
      }
    }
  })

  return {
    ...operationStarted(operationId),
    discardedItems: 0,
  }
}

export type LimitReached = { result: 'limitReached' }
const limitReached: LimitReached = { result: 'limitReached' }

/**
 * Retrieve the body of a specific block
 *
 * @param context
 * @param params - [`followSubscription`, `hash`]
 *
 * @return OperationStarted event with operationId to receive the result on the follow subscription
 */
export const chainHead_v1_body: Handler<[string, HexString], OperationStarted | LimitReached> = async (
  context,
  [followSubscription, hash],
) => {
  if (!following.has(followSubscription)) return limitReached
  const block = await context.chain.getBlock(hash)
  if (!block) {
    throw new ResponseError(-32801, 'Block not found')
  }

  const operationId = randomId()
  afterResponse(async () => {
    const body = await block.extrinsics

    following.get(followSubscription)?.callback({
      event: 'operationBodyDone',
      operationId,
      value: body,
    })
  })

  return operationStarted(operationId)
}

/**
 * Resume an operation paused through `operationWaitingForContinue`
 *
 * @param context
 * @param params - [`followSubscription`, `operationId`]
 */
export const chainHead_v1_continue: Handler<[string, HexString], null> = async (
  context,
  [followSubscription, operationId],
) => {
  const follower = following.get(followSubscription)
  const pendingOp = follower?.pendingDescendantValues.get(operationId)
  if (!pendingOp || !follower) {
    throw new ResponseError(-32803, "Operation ID doesn't have anything pending")
  }
  const block = await context.chain.getBlock(pendingOp.hash)
  if (!block) {
    throw new ResponseError(-32801, 'Block not found')
  }

  afterResponse(async () => {
    const handlePendingOperation = async (params: DescendantValuesParams) => {
      const { items, next } = await getDescendantValues(block, params)

      follower.callback({
        event: 'operationStorageItems',
        operationId,
        items,
      })

      return next
    }

    const listResult = await Promise.all(pendingOp.params.map(handlePendingOperation))
    const pending = listResult.filter((v) => v !== null)

    if (!pending.length) {
      follower.pendingDescendantValues.delete(operationId)
      follower.callback({
        event: 'operationStorageDone',
        operationId,
      })
    } else {
      follower.pendingDescendantValues.set(operationId, { hash: pendingOp.hash, params: pending })
      follower.callback({
        event: 'operationWaitingForContinue',
        operationId,
      })
    }
  })

  return null
}

export const chainHead_v1_stopOperation: Handler<[string, HexString], null> = async (
  _context,
  [followSubscription, operationId],
) => {
  following.get(followSubscription)?.pendingDescendantValues.delete(operationId)

  return null
}

// no-op, since there's no concept of unpinning in chopsticks
export const chainHead_v1_unpin: Handler<[string, HexString | HexString[]], null> = async (
  _context,
  [_followSubscription, _hashOrHashes],
) => {
  return null
}
