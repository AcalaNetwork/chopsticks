import '@polkadot/types-codec'
import { Block } from '../blockchain/block'
import { HexString } from '@polkadot/util/types'
import { StorageEntry } from '@polkadot/types/primitive/types'
import { StorageKey } from '@polkadot/types'
import { create } from 'jsondiffpatch'
import { hexToU8a, u8aToHex } from '@polkadot/util'
import _ from 'lodash'

const diffPatcher = create({
  array: { detectMove: false },
  textDiff: { minLength: Number.MAX_VALUE }, // skip text diff
})

const cache: Record<HexString, StorageEntry> = {}

const getStorageEntry = async (block: Block, key: HexString) => {
  for (const [prefix, storageEntry] of Object.entries(cache)) {
    if (key.startsWith(prefix)) return storageEntry
  }
  const meta = await block.meta
  for (const module of Object.values(meta.query)) {
    for (const storage of Object.values(module)) {
      const keyPrefix = u8aToHex(storage.keyPrefix())
      if (key.startsWith(keyPrefix)) {
        cache[keyPrefix] = storage
        return storage
      }
    }
  }
  throw new Error(`Cannot find key ${key}`)
}

export const decodeKey = async (
  block: Block,
  key: HexString
): Promise<{ storage?: StorageEntry; decodedKey?: StorageKey }> => {
  const meta = await block.meta
  const storage = await getStorageEntry(block, key).catch(() => undefined)
  const decodedKey = meta.registry.createType('StorageKey', key)
  if (storage) {
    decodedKey.setMeta(storage.meta)
    return { storage, decodedKey }
  }
  return {}
}

export const decodeKeyValue = async (block: Block, key: HexString, value?: HexString | null) => {
  const meta = await block.meta
  const { storage, decodedKey } = await decodeKey(block, key)

  if (!storage || !decodedKey) {
    return { [key]: value }
  }

  const decodedValue = value ? meta.registry.createType(decodedKey.outputType, hexToU8a(value)).toHuman() : null

  switch (decodedKey.args.length) {
    case 2: {
      return {
        [storage.section]: {
          [storage.method]: {
            [decodedKey.args[0].toString()]: {
              [decodedKey.args[1].toString()]: decodedValue,
            },
          },
        },
      }
    }
    case 1: {
      return {
        [storage.section]: {
          [storage.method]: {
            [decodedKey.args[0].toString()]: decodedValue,
          },
        },
      }
    }
    default:
      return {
        [storage.section]: {
          [storage.method]: decodedValue,
        },
      }
  }
}

export const decodeStorageDiff = async (block: Block, diff: [HexString, HexString | null][]) => {
  const parent = await block.parentBlock
  if (!parent) throw new Error('Cannot find parent block')

  const oldState = {}
  const newState = {}
  for (const [key, value] of diff) {
    _.merge(oldState, await decodeKeyValue(parent, key, (await parent.get(key)) as any))
    _.merge(newState, await decodeKeyValue(block, key, value))
  }
  return [oldState, newState, diffPatcher.diff(oldState, newState)]
}
