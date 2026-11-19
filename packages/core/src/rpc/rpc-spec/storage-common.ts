import type { HexString } from '@polkadot/util/types'
import type { Block } from '../../blockchain/block.js'
import { defaultLogger } from '../../logger.js'

const logger = defaultLogger.child({ name: 'rpc-storage' })

export async function getDescendantValues(
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

  const items = (await block.getMany(keys)).map((value, idx) => ({
    key: keys[idx],
    value,
  }))

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
export const PAGE_SIZE = 1000
export type DescendantValuesParams = {
  prefix: string
  startKey: string
  isDescendantHashes?: boolean
}

export function afterResponse(fn: () => Promise<void>, onError: (error: unknown) => void) {
  void new Promise((resolve) => setTimeout(resolve, 0))
    .then(fn)
    .catch(onError)
    .catch((err) => logger.error({ err }, 'Failed to report deferred RPC error'))
}

export async function settleStorageReads<T>(reads: Promise<T>[]): Promise<T[]> {
  // Let reads that are already running finish emitting items before sending a terminal event.
  const results = await Promise.allSettled(reads)
  return results.map((result) => {
    if (result.status === 'rejected') throw result.reason
    return result.value
  })
}
