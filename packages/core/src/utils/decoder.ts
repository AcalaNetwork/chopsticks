import '@polkadot/types-codec'
import { Block } from '../blockchain/block.js'
import { DecoratedMeta } from '@polkadot/types/metadata/decorate/types'
import { HexString } from '@polkadot/util/types'
import { LRUCache } from 'lru-cache'
import { Registry } from '@polkadot/types-codec/types'
import { StorageEntry } from '@polkadot/types/primitive/types'
import { StorageKey } from '@polkadot/types'
import { hexToU8a, u8aToHex } from '@polkadot/util'
import _ from 'lodash'

import { decodeWellKnownKey } from './well-known-keys.js'
import { defaultLogger } from '../logger.js'

const logger = defaultLogger.child({ name: 'decoder' })

const _CACHE: LRUCache<Registry, LRUCache<HexString, StorageEntry>> = new LRUCache({ max: 20 /* max 20 registries */ })

const getCache = (registry: Registry): LRUCache<HexString, StorageEntry> => {
  const cache = _CACHE.get(registry)
  if (cache) {
    return cache
  }
  const newCache = new LRUCache<HexString, StorageEntry>({ max: 100 /* max 100 storage entries */ })
  _CACHE.set(registry, newCache)
  return newCache
}

const getStorageEntry = (meta: DecoratedMeta, key: HexString) => {
  const cache = getCache(meta.registry)
  for (const prefix of cache.keys()) {
    if (key.startsWith(prefix))
      // update the recency of the cache entry
      return cache.get(prefix)
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

export const decodeKey = (meta: DecoratedMeta, key: HexString): { storage?: StorageEntry; decodedKey?: StorageKey } => {
  const storage = getStorageEntry(meta, key)
  const decodedKey = meta.registry.createType('StorageKey', key)
  if (storage) {
    decodedKey.setMeta(storage.meta)
    return { storage, decodedKey }
  }
  return {}
}

export const decodeKeyValue = (meta: DecoratedMeta, key: HexString, value?: HexString | null, toHuman = true) => {
  const res = decodeWellKnownKey(meta.registry, key, value)
  if (res) {
    return {
      section: 'substrate',
      method: res.name,
      key: res.key,
      value: res.value,
    }
  }

  const { storage, decodedKey } = decodeKey(meta, key)

  if (!storage || !decodedKey) {
    logger.warn({ key, value }, 'Failed to decode storage key')
    return undefined
  }

  const decodeValue = () => {
    if (!value) return null
    try {
      return meta.registry.createType(decodedKey.outputType, hexToU8a(value))[toHuman ? 'toHuman' : 'toJSON']()
    } catch (error) {
      logger.warn(error, 'Failed to decode storage value')
      logger.warn(
        { key, value, section: storage.section, method: storage.method, args: decodedKey.args },
        'Failed to decode storage value',
      )
      return undefined
    }
  }

  return {
    section: storage.section,
    method: storage.method,
    key: decodedKey.args.map((x) => x.toJSON()),
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
      const strKey = ['string', 'number'].includes(typeof k) ? k : JSON.stringify(k)
      const newObj = { [strKey]: obj }
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
    const oldDecoded = toStorageObject(decodeKeyValue(meta, key, oldValue)) ?? { [key]: oldValue }
    _.merge(oldState, oldDecoded)

    const newDecoded = toStorageObject(decodeKeyValue(meta, key, value)) ?? { [key]: value }
    _.merge(newState, newDecoded)
  }
  return [oldState, newState]
}
