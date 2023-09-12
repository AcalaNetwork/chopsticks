import { HexString } from '@polkadot/util/types'
import { StorageKey } from '@polkadot/types'
import { compactStripLength, hexToU8a, u8aToHex } from '@polkadot/util'
import { hexAddPrefix, hexStripPrefix } from '@polkadot/util/hex'

import { Blockchain } from '../blockchain'

export * from './set-storage'
export * from './time-travel'
export * from './decoder'

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

export const getParaId = async (chain: Blockchain) => {
  const meta = await chain.head.meta
  const raw = await chain.head.get(compactHex(meta.query.parachainInfo.parachainId()))
  if (!raw) throw new Error('Cannot find parachain id')
  return meta.registry.createType('u32', hexToU8a(raw))
}

export const isUrl = (url: string) => {
  try {
    new URL(url)
    return true
  } catch (e) {
    return false
  }
}

export type Deferred<T> = {
  resolve: (value: T | PromiseLike<T>) => void
  reject: (reason?: any) => void
  promise: Promise<T>
}

export function defer<T>() {
  const deferred = {} as Deferred<T>
  deferred.promise = new Promise((resolve, reject) => {
    deferred.resolve = resolve
    deferred.reject = reject
  })
  return deferred
}

export const mergeKey = (...keys: (string | undefined)[]) =>
  hexAddPrefix(
    keys
      .filter((x) => !!x)
      .map((hex) => hexStripPrefix(hex))
      .join(''),
  )

const DEFAULT_CHILD_STORAGE = '0x3a6368696c645f73746f726167653a64656661756c743a'
const CHILD_LENGTH = DEFAULT_CHILD_STORAGE.length + 64

export const isChild = (key: string) => key.startsWith(DEFAULT_CHILD_STORAGE)

// returns a key that is split into the child storage key and the rest
export const splitChild = (key: string) => {
  if (!key.startsWith(DEFAULT_CHILD_STORAGE)) return
  if (key.length < CHILD_LENGTH) return
  const child = key.slice(0, CHILD_LENGTH)
  const rest = key.slice(CHILD_LENGTH)
  return [child, hexAddPrefix(rest)]
}

// returns a key that is stripped of the child storage key
export const stripChild = (key: string) => {
  const parts = splitChild(key)
  if (!parts) return key
  return parts[1]
}
