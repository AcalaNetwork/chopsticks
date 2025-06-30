import type { Block } from '../../blockchain/block.js'
import type { HexString } from '@polkadot/util/types'

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
export const PAGE_SIZE = 1000
export type DescendantValuesParams = {
  prefix: string
  startKey: string
  isDescendantHashes?: boolean
}

export async function afterResponse(fn: () => void) {
  await new Promise((resolve) => setTimeout(resolve, 0))
  fn()
}
