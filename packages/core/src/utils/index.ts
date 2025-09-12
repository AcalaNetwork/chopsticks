import type { StorageKey } from '@polkadot/types'
import { type BN, compactStripLength, u8aToHex } from '@polkadot/util'
import { hexAddPrefix, hexStripPrefix } from '@polkadot/util/hex'
import type { HexString } from '@polkadot/util/types'
import type { Block } from '../blockchain/block.js'
import type { Blockchain } from '../blockchain/index.js'
import { getAuraSlotDuration, getSpinSlotDuration } from '../wasm-executor/index.js'

export * from './decoder.js'
export * from './set-storage.js'
export * from './time-travel.js'

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
  const id = await chain.head.read('u32', meta.query.parachainInfo.parachainId)
  if (!id) {
    throw new Error('Cannot find parachain id')
  }
  return id
}

export const isUrl = (url: string) => {
  try {
    new URL(url)
    return true
  } catch (_e) {
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

// Chopsticks treats both main storage and child storage as a key-value store
// The difference is that child storage keys are prefixed with the child storage key

// :child_storage:default: as hex string
const DEFAULT_CHILD_STORAGE = '0x3a6368696c645f73746f726167653a64656661756c743a'

// length of the child storage key
export const CHILD_PREFIX_LENGTH = DEFAULT_CHILD_STORAGE.length + 64

// 0x + 32 module + 32 method
export const PREFIX_LENGTH = 66

// returns a key that is prefixed with the child storage key
export const prefixedChildKey = (prefix: HexString, key: HexString): HexString =>
  (prefix + hexStripPrefix(key)) as HexString

// returns true if the key is a child storage key
export const isPrefixedChildKey = (key: HexString) => key.startsWith(DEFAULT_CHILD_STORAGE)

// returns a key that is split into the child storage key and the rest
export const splitChildKey = (key: HexString) => {
  if (!key.startsWith(DEFAULT_CHILD_STORAGE)) return []
  if (key.length < CHILD_PREFIX_LENGTH) return []
  const child = key.slice(0, CHILD_PREFIX_LENGTH)
  const rest = key.slice(CHILD_PREFIX_LENGTH)
  return [child, hexAddPrefix(rest)] as [HexString, HexString]
}

// returns a key that is stripped of the child storage key
export const stripChildPrefix = (key: HexString) => {
  const [child, storageKey] = splitChildKey(key)
  if (!child) return key
  return storageKey
}

export const getCurrentSlot = async (head: Block) => {
  const timestamp = await getCurrentTimestamp(head)
  const slotDuration = await getSlotDuration(head)
  return Math.floor(Number(timestamp / BigInt(slotDuration)))
}

export const getCurrentTimestamp = async (head: Block) => {
  const meta = await head.meta
  const timestamp = await head.read('u64', meta.query.timestamp.now)
  return timestamp?.toBigInt() ?? BigInt(Date.now())
}

export const getSlotDuration = async (head: Block) => {
  const meta = await head.meta
  let slotDuration: number
  slotDuration ??= (meta.consts.babe?.expectedBlockTime as any as BN)?.toNumber()
  slotDuration ??= (meta.consts.asyncBacking?.expectedBlockTime as any as BN)?.toNumber()

  if (slotDuration) {
    return slotDuration
  }

  const wasm = await head.wasm

  try {
    return await getAuraSlotDuration(wasm)
  } catch {}

  try {
    return await getSpinSlotDuration(wasm)
  } catch {}

  return 12_000
}
