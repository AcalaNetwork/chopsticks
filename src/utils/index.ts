import { HexString } from '@polkadot/util/types'
import { StorageKey } from '@polkadot/types'
import { compactStripLength, u8aToHex } from '@polkadot/util'

export type GetKeys = (startKey?: string) => Promise<StorageKey<any>[]>

export type ProcessKey = (key: StorageKey<any>) => any

export async function fetchKeys(getKeys: GetKeys, processKey: ProcessKey) {
  const processKeys = async (keys: StorageKey<any>[]) => {
    for (const key of keys) {
      await processKey(key)
    }

    if (keys.length > 0) {
      return keys[keys.length - 1]
    }

    return undefined
  }

  const keys = await getKeys()
  let nextKey = await processKeys(keys)
  while (nextKey) {
    const keys = await getKeys(nextKey.toHex())
    nextKey = await processKeys(keys)
  }
}

export async function fetchKeysToArray(getKeys: GetKeys) {
  const res = [] as StorageKey<any>[]
  await fetchKeys(getKeys, (key) => res.push(key))
  return res
}

export const compactHex = (value: Uint8Array): HexString => {
  return u8aToHex(compactStripLength(value)[1])
}
