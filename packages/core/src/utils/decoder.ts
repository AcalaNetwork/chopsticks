import '@polkadot/types-codec'
import { Block } from '../blockchain/block'
import { DecoratedMeta } from '@polkadot/types/metadata/decorate/types'
import { HexString } from '@polkadot/util/types'
import { StorageEntry } from '@polkadot/types/primitive/types'
import { StorageKey } from '@polkadot/types'
import { blake2AsHex } from '@polkadot/util-crypto'
import { hexToU8a, u8aToHex } from '@polkadot/util'
import _ from 'lodash'

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

export const decodeKeyValue = (meta: DecoratedMeta, block: Block, key: HexString, value?: HexString | null) => {
  const { storage, decodedKey } = decodeKey(meta, block, key)

  if (!storage || !decodedKey) {
    return { [key]: value }
  }

  const decodeValue = () => {
    if (!value) return null
    if (storage.section === 'substrate' && storage.method === 'code') {
      return `:code blake2_256 ${blake2AsHex(value, 256)} (${hexToU8a(value).length} bytes)`
    }
    return meta.registry.createType(decodedKey.outputType, hexToU8a(value)).toHuman()
  }

  switch (decodedKey.args.length) {
    case 2: {
      return {
        [storage.section]: {
          [storage.method]: {
            [decodedKey.args[0].toString()]: {
              [decodedKey.args[1].toString()]: decodeValue(),
            },
          },
        },
      }
    }
    case 1: {
      return {
        [storage.section]: {
          [storage.method]: {
            [decodedKey.args[0].toString()]: decodeValue(),
          },
        },
      }
    }
    default:
      return {
        [storage.section]: {
          [storage.method]: decodeValue(),
        },
      }
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
    _.merge(oldState, decodeKeyValue(meta, block, key, (await block.get(key)) as any))
    _.merge(newState, decodeKeyValue(meta, block, key, value))
  }
  return [oldState, newState]
}
