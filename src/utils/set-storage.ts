import { ApiPromise } from '@polkadot/api'
import { Metadata, StorageKey } from '@polkadot/types'
import { Registry } from '@polkadot/types/types'
import { StorageEntryMetadataLatest } from '@polkadot/types/interfaces'
import { createFunction } from '@polkadot/types/metadata/decorate/storage/createFunction'
import assert from 'assert'

import { Blockchain } from '../blockchain'

interface StorageKeyMaker {
  meta: StorageEntryMetadataLatest
  makeKey: (...keys: any[]) => StorageKey
}

const storageKeyMaker =
  (registry: Registry, metadata: Metadata) =>
  (section: string, method: string): StorageKeyMaker => {
    const pallet = metadata.asLatest.pallets.filter((x) => x.name.toString() === section)[0]
    assert(pallet)
    const meta = pallet.storage
      .unwrap()
      .items.filter((x) => x.name.toString() === method)[0] as any as StorageEntryMetadataLatest
    assert(meta)

    const storageFn = createFunction(
      registry,
      {
        meta,
        prefix: section,
        section,
        method,
      },
      {}
    )

    return {
      meta,
      makeKey: (...keys: any[]): StorageKey => new StorageKey(registry, [storageFn, keys]),
    }
  }

function objectToStorageItems(
  api: ApiPromise,
  storage: Record<string, Record<string, any | [any, any][]>>
): [string, string][] {
  const storageItems: [string, string][] = [] as [string, string][]
  for (const sectionName in storage) {
    const section = storage[sectionName]
    for (const storageName in section) {
      const storage = section[storageName]
      const { makeKey, meta } = storageKeyMaker(api.registry, api.runtimeMetadata)(sectionName, storageName)
      if (meta.type.isPlain) {
        const key = makeKey()
        storageItems.push([
          key.toHex(),
          storage ? api.createType(key.outputType, storage).toHex(true) : ""
        ])
      } else {
        for (const [keys, value] of storage) {
          const key = makeKey(...keys)
          storageItems.push([
            key.toHex(),
            value ? api.createType(key.outputType, value).toHex(true) : ""
          ])
        }
      }
    }
  }
  return storageItems
}

export const setStorage = async (
  chain: Blockchain,
  storage: [string, string][] | Record<string, Record<string, any | Record<string, any>>>
): Promise<void> => {
  let storageItems: [string, string][]
  if (Array.isArray(storage)) {
    storageItems = storage
  } else {
    storageItems = objectToStorageItems(chain.api, storage)
  }
  const block = await chain.getBlock()
  assert(block)
  block.pushStorageLayer().setAll(storageItems)
}
