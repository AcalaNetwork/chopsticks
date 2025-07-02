import { afterResponse, getDescendantValues } from './storage-common.js'

import { blake2AsHex } from '@polkadot/util-crypto'
import type { HexString } from '@polkadot/util/types'
import { randomId } from '../../blockchain/head-state.js'
import { type Handler, ResponseError } from '../shared.js'
import { archive_unstable_body, archive_unstable_call } from '../substrate/archive.js'
import type { StorageItemRequest } from './chainHead_v1.js'
import type { DescendantValuesParams } from './storage-common.js'

/**
 * Retrieve the body of a specific block
 *
 * @param context
 * @param params - [`hash`]
 *
 * @return An array of the SCALE-encoded transactions of a block, or `null` if the block is not found.
 */
export const archive_v1_body: Handler<[HexString], HexString[] | null> = async (...args) =>
  archive_unstable_body.call(undefined, ...args).then(
    (x) => x,
    () => null,
  )

export type CallResult =
  | {
      success: true
      value: HexString
    }
  | {
      success: false
      error: any
    }

/**
 * Perform a runtime call for a block
 *
 * @param context
 * @param params - [`hash`, `function`, `callParameters`]
 *
 * @return A {@link CallResult} with the result of the runtime call, or `null` if the block
 * is not found.
 */
function isBlockNotFound(error) {
  return error instanceof ResponseError && error.code === 1
}

export const archive_v1_call: Handler<[HexString, string, HexString], CallResult | null> = async (...args) =>
  archive_unstable_call.call(undefined, ...args).then(
    ({ value }) => ({ success: true, value }),
    (error) => (isBlockNotFound(error) ? null : { success: false, error }),
  )

/**
 * Retrieve the height of the finalized block.
 *
 * @param context
 *
 * @return The `number` of the height of the head (a.k.a. finalized) block.
 */
export const archive_v1_finalizedHeight: Handler<undefined, number> = (context) => {
  return Promise.resolve(context.chain.head.number)
}

/**
 * Retrieve the genesis hash
 *
 * @param context
 *
 * @return An {@link HexString} with the hash of the genesis block.
 */
export const archive_v1_genesisHash: Handler<undefined, HexString> = async (context) => {
  const genesisBlock = await context.chain.getBlockAt(0)
  return genesisBlock!.hash
}

/**
 * Retrieve the hash of a specific height
 *
 * @param context
 * @param params - [`height`]
 *
 * @return An array of {@link HexString} with the hashes of the blocks associated to the
 * given height.
 */
export const archive_v1_hashByHeight: Handler<[number], HexString[]> = async (context, [height]) => {
  const block = await context.chain.getBlockAt(height)
  return block ? [block.hash] : []
}

/**
 * Retrieve the header for a specific block
 *
 * @param context
 * @param params - [`hash`]
 *
 * @return SCALE-encoded header, or `null` if the block is not found.
 */
export const archive_v1_header: Handler<[HexString], HexString | null> = async (context, [hash]) => {
  const block = await context.chain.getBlock(hash)
  return block ? (await block.header).toHex() : null
}

/**
 * Contains the storage operations.
 */
const storageOperations = new Map<
  string,
  {
    callback: (data: any) => void
    hash: HexString
    params: DescendantValuesParams[]
    storageDiffs: Map<HexString, number>
  }
>()

/**
 * Query the storage for a given block
 *
 * @param context
 * @param params - [`hash`, `items`, `childTrie`]
 *
 * @return the operationId to capture the notifications where to receive the result
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
export const archive_v1_storage: Handler<[HexString, StorageItemRequest[], HexString | null], string> = async (
  context,
  [hash, items, _childTrie],
  { subscribe },
) => {
  const operationId = randomId()

  const callback = subscribe('chainHead_v1_storageEvent', operationId, () => storageOperations.delete(operationId))
  storageOperations.set(operationId, {
    callback,
    hash,
    params: [],
    storageDiffs: new Map(),
  })

  afterResponse(async () => {
    const block = await context.chain.getBlock(hash)
    if (!block) {
      storageOperations.get(operationId)?.callback({
        event: 'storageError',
        operationId,
        error: 'Block not found',
      })
      return
    }

    const handleStorageItemRequest = async (sir: StorageItemRequest): Promise<DescendantValuesParams | null> => {
      switch (sir.type) {
        case 'value': {
          const value = await block.get(sir.key)
          if (value) {
            storageOperations.get(operationId)?.callback({
              event: 'storage',
              key: sir.key,
              value,
            })
          }

          return null
        }

        case 'hash': {
          const value = await block.get(sir.key)
          if (value) {
            storageOperations.get(operationId)?.callback({
              event: 'storage',
              key: sir.key,
              hash,
            })
          }

          return null
        }

        case 'descendantsValues': {
          let items: Awaited<ReturnType<typeof getDescendantValues>>['items']
          let next: Awaited<ReturnType<typeof getDescendantValues>>['next'] = {
            prefix: sir.key,
            startKey: '0x',
          }
          do {
            ;({ items, next } = await getDescendantValues(block, next))

            for (const { key, value } of items) {
              storageOperations.get(operationId)?.callback({
                event: 'storage',
                key,
                value,
              })
            }
          } while (next !== null)

          return null
        }

        case 'descendantsHashes': {
          let items: Awaited<ReturnType<typeof getDescendantValues>>['items']
          let next: Awaited<ReturnType<typeof getDescendantValues>>['next'] = {
            prefix: sir.key,
            startKey: '0x',
          }
          do {
            ;({ items, next } = await getDescendantValues(block, next))

            for (const { key, value } of items) {
              if (value === undefined) {
                continue
              }

              storageOperations.get(operationId)?.callback({
                event: 'storage',
                key,
                hash: blake2AsHex(value),
              })
            }
          } while (next !== null)

          return null
        }

        case 'closestDescendantMerkleValue': {
          const subscription = storageOperations.get(operationId)
          if (!subscription) return null
          if (!subscription.storageDiffs.has(sir.key)) {
            // Set up a diff watch for this key
            subscription.storageDiffs.set(sir.key, 0)
          }

          subscription.callback({
            event: 'storage',
            operationId,
            items: [
              {
                key: sir.key,
                closestDescendantMerkleValue: String(subscription.storageDiffs.get(sir.key)),
              },
            ],
          })

          return null
        }
      }
    }

    await Promise.all(items.map(handleStorageItemRequest))

    storageOperations.get(operationId)?.callback({
      event: 'storageDone',
    })
  })

  return operationId
}

export const archive_v1_stopStorage: Handler<[string], null> = async (_, [operationId], { unsubscribe }) => {
  unsubscribe(operationId)
  return null
}
