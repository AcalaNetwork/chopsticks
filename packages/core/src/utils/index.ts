import { BN, compactStripLength, hexToU8a, u8aToHex } from '@polkadot/util'
import { HexString } from '@polkadot/util/types'
import { Slot } from '@polkadot/types/interfaces'
import { StorageKey } from '@polkadot/types'
import { getAuraSlotDuration } from '../wasm-executor/index.js'
import { hexAddPrefix, hexStripPrefix } from '@polkadot/util/hex'

import { Blockchain } from '../blockchain/index.js'

export * from './set-storage.js'
export * from './time-travel.js'
export * from './decoder.js'

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

// Chopsticks treats both main storage and child storage as a key-value store
// The difference is that child storage keys are prefixed with the child storage key

// :child_storage:default: as hex string
const DEFAULT_CHILD_STORAGE = '0x3a6368696c645f73746f726167653a64656661756c743a'

// length of the child storage key
export const CHILD_PREFIX_LENGTH = DEFAULT_CHILD_STORAGE.length + 64

// 0x + 32 module + 32 method
export const PREFIX_LENGTH = 66

// returns a key that is prefixed with the child storage key
export const prefixedChildKey = (prefix: HexString, key: HexString) => prefix + hexStripPrefix(key)

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

// use raw key here because some chain did not expose those storage to metadata
const POTENTIAL_SLOT_KEYS = [
  '0x1cb6f36e027abb2091cfb5110ab5087f06155b3cd9a8c9e5e9a23fd5dc13a5ed', // babe.currentSlot
  '0x57f8dc2f5ab09467896f47300f04243806155b3cd9a8c9e5e9a23fd5dc13a5ed', // aura.currentSlot
  '0x8985dff79e6002d0deba9ddac46f32a5a70806914c906d747e668a21f9021729', // asynchronousBacking.slotInfo
  '0xab2a8d5eca218f218c6fda6b1d22bb926bc171ab77f6a731a6e80c34ee1eda19', // authorInherent.highestSlotSeen
]

export const getCurrentSlot = async (chain: Blockchain) => {
  const meta = await chain.head.meta
  for (const key of POTENTIAL_SLOT_KEYS) {
    const slotRaw = await chain.head.get(key)
    if (slotRaw) {
      return meta.registry.createType<Slot>('Slot', hexToU8a(slotRaw)).toNumber()
    }
  }
  throw new Error('Cannot find current slot')
}

export const getCurrentTimestamp = async (chain: Blockchain) => {
  const meta = await chain.head.meta
  const timestamp = await chain.head.read('u64', meta.query.timestamp.now)
  return timestamp?.toBigInt() ?? 0n
}

export const getSlotDuration = async (chain: Blockchain) => {
  const meta = await chain.head.meta
  return meta.consts.babe
    ? (meta.consts.babe.expectedBlockTime as any as BN).toNumber()
    : meta.query.aura
      ? getAuraSlotDuration(await chain.head.wasm)
      : meta.consts.asyncBacking
        ? (meta.consts.asyncBacking.expectedBlockTime as any as BN).toNumber()
        : 12_000
}
