import { Block } from '../../blockchain/block.js'
import { Handler, ResponseError, SubscriptionManager } from '../shared.js'
import { HexString } from '@polkadot/util/types'
import { defaultLogger } from '../../logger.js'

const logger = defaultLogger.child({ name: 'rpc-chainHead_v1' })

const callbacks = new Map<string, (data: any) => void>()

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
  }

  const id = context.chain.headState.subscribeHead(update)

  const cleanup = () => {
    context.chain.headState.unsubscribeHead(id)
    callbacks.delete(id)
  }

  const callback = subscribe('chainHead_v1_followEvent', id, cleanup)
  callbacks.set(id, callback)

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
  if (!callbacks.has(followSubscription)) return null
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
      callbacks.get(followSubscription)?.({
        event: 'operationError',
        operationId,
        error: `Block ${hash} not found`,
      })
    } else {
      try {
        const resp = await block.call(method, [callParameters])
        callbacks.get(followSubscription)?.({
          event: 'operationCallDone',
          operationId,
          output: resp.result,
        })
      } catch (ex: any) {
        callbacks.get(followSubscription)?.({
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

/**
 * Query the storage for a given block
 *
 * @param context
 * @param params - [`followSubscription`, `hash`, `items`, `childTrie`]
 *
 * @return OperationStarted event with operationId to receive the result on the follow subscription
 */
export const chainHead_v1_storage: Handler<
  [string, HexString, StorageItemRequest[], HexString | null],
  StorageStarted
> = async (context, [followSubscription, hash, items, _childTrie]) => {
  const operationId = randomId()

  afterResponse(async () => {
    const block = await context.chain.getBlock(hash)
    if (!block) {
      callbacks.get(followSubscription)?.({
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
            callbacks.get(followSubscription)?.({
              event: 'operationStorageItems',
              operationId,
              items: [{ key: sir.key, value }],
            })
          }
          break
        }
        case 'descendantsValues': {
          // TODO expose pagination
          const pageSize = 100
          let startKey: string | null = '0x'
          while (startKey) {
            const keys = await block.getKeysPaged({
              prefix: sir.key,
              pageSize,
              startKey,
            })
            startKey = keys[pageSize - 1] ?? null

            const items = await Promise.all(
              keys.map((key) =>
                block.get(key).then((value) => ({
                  key,
                  value,
                })),
              ),
            )
            callbacks.get(followSubscription)?.({
              event: 'operationStorageItems',
              operationId,
              items,
            })
            break
          }
          break
        }
        default:
          // TODO
          console.warn(`Storage type not implemented ${sir.type}`)
      }
    }

    await Promise.all(items.map(handleStorageItemRequest))

    callbacks.get(followSubscription)?.({
      event: 'operationStorageDone',
      operationId,
    })
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
  if (!callbacks.has(followSubscription)) return limitReached
  const block = await context.chain.getBlock(hash)
  if (!block) {
    throw new ResponseError(-32801, 'Block not found')
  }

  const operationId = randomId()
  afterResponse(async () => {
    const body = await block.extrinsics

    callbacks.get(followSubscription)?.({
      event: 'operationBodyDone',
      operationId,
      value: body,
    })
  })

  return operationStarted(operationId)
}

// Currently no-ops, will come into play when pagination is implemented
export const chainHead_v1_continue: Handler<[string, HexString], null> = async (
  _context,
  [_followSubscription, _operationId],
) => {
  return null
}

export const chainHead_v1_stopOperation: Handler<[string, HexString], null> = async (
  _context,
  [_followSubscription, _operationId],
) => {
  return null
}

// no-op, since there's no concept of unpinning in chopsticks
export const chainHead_v1_unpin: Handler<[string, HexString | HexString[]], null> = async (
  _context,
  [_followSubscription, _hashOrHashes],
) => {
  return null
}
