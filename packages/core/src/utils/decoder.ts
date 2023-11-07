import '@polkadot/types-codec'
import { Block } from '../blockchain/block'
import { DecoratedMeta } from '@polkadot/types/metadata/decorate/types'
import { HexString } from '@polkadot/util/types'
import { StorageEntry } from '@polkadot/types/primitive/types'
import { StorageKey } from '@polkadot/types'
import { hexToU8a, u8aToHex } from '@polkadot/util'
import _ from 'lodash'

import { decodeWellKnownKey } from './well-known-keys'

const _CACHE: Record<string, Map<HexString, StorageEntry>> = {}

const getCache = (uid: string): Map<HexString, StorageEntry> => {
  if (!_CACHE[uid]) {
    _CACHE[uid] = new Map()
  }
  return _CACHE[uid]
}

const getStorageEntry = (meta: DecoratedMeta, block: Block, key: HexString) => {
  const cache = getCache(block.chain.uid)
  for (const [prefix, storageEntry] of cache.entries()) {
    if (key.startsWith(prefix)) return storageEntry
  }
  for (const module of Object.values(meta.query)) {
    for (const storage of Object.values(module)) {
      const keyPrefix = u8aToHex(storage.keyPrefix())
      if (key.startsWith(keyPrefix)) {
        cache.set(keyPrefix, storage)
        return storage
      }
    }
  }
  return undefined
}

export const decodeKey = (
  meta: DecoratedMeta,
  block: Block,
  key: HexString,
): { storage?: StorageEntry; decodedKey?: StorageKey } => {
  const storage = getStorageEntry(meta, block, key)
  const decodedKey = meta.registry.createType('StorageKey', key)
  if (storage) {
    decodedKey.setMeta(storage.meta)
    return { storage, decodedKey }
  }
  return {}
}

export const decodeKeyValue = (
  meta: DecoratedMeta,
  block: Block,
  key: HexString,
  value?: HexString | null,
  toHuman = true,
) => {
  const res = decodeWellKnownKey(meta.registry, key, value)
  if (res) {
    return {
      section: 'substrate',
      method: res.name,
      key: res.key,
      value: res.value,
    }
  }

  const { storage, decodedKey } = decodeKey(meta, block, key)

  if (!storage || !decodedKey) {
    return undefined
  }

  const decodeValue = () => {
    if (!value) return null
    return meta.registry.createType(decodedKey.outputType, hexToU8a(value))[toHuman ? 'toHuman' : 'toJSON']()
  }

  return {
    section: storage.section,
    method: storage.method,
    key: decodedKey.args.map(x => x.toJSON()),
    value: decodeValue(),
  }
}

export const toStorageObject = (decoded: ReturnType<typeof decodeKeyValue>) => {
  if (!decoded) {
    return undefined
  }

  const { section, method, key, value } = decoded

  let obj = value

  if (key) {
    for (let i = key.length - 1; i >= 0; i--) {
      const k = key[i]
      const newObj = { [k.toString()]: obj }
      obj = newObj
    }
  }

  return {
    [section]: {
      [method]: obj,
    },
  }
}

/**
 * Decode block storage diff
 * @param block Block to compare storage diff
 * @param diff Storage diff
 * @returns decoded old state and new state
 */
export const decodeBlockStorageDiff = async (block: Block, diff: [HexString, HexString | null][]) => {
  const oldState = {}
  const newState = {}
  const meta = await block.meta
  for (const [key, value] of diff) {
    const oldValue = await block.get(key)
    const oldDecoded = toStorageObject(decodeKeyValue(meta, block, key, oldValue)) ?? { [key]: oldValue }
    _.merge(oldState, oldDecoded)

    const newDecoded = toStorageObject(decodeKeyValue(meta, block, key, value)) ?? { [key]: value }
    _.merge(newState, newDecoded)
  }
  return [oldState, newState]
}
