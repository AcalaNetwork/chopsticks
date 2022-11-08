import { ApiPromise } from '@polkadot/api'
import { Metadata, StorageKey } from '@polkadot/types'
import { Registry } from '@polkadot/types/types'
import { StorageEntryMetadataLatest } from '@polkadot/types/interfaces'
import { createFunction } from '@polkadot/types/metadata/decorate/storage/createFunction'

import { Blockchain } from '../blockchain'

type RawStorageValues = [string, string | null][]
type StorageConfig = Record<string, Record<string, any>>
export type StorageValues = RawStorageValues | StorageConfig

interface StorageKeyMaker {
  meta: StorageEntryMetadataLatest
  makeKey: (...keys: any[]) => StorageKey
}

const storageKeyMaker =
  (registry: Registry, metadata: Metadata) =>
  (section: string, method: string): StorageKeyMaker => {
    const pallet = metadata.asLatest.pallets.filter((x) => x.name.toString() === section)[0]
    if (!pallet) throw Error(`Cannot find pallet ${section}`)
    const meta = pallet.storage
      .unwrap()
      .items.filter((x) => x.name.toString() === method)[0] as any as StorageEntryMetadataLatest
    if (!meta) throw Error(`Cannot find meta for storage ${section}.${method}`)

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

function objectToStorageItems(api: ApiPromise, storage: StorageConfig): RawStorageValues {
  const storageItems: RawStorageValues = []
  for (const sectionName in storage) {
    const section = storage[sectionName]
    for (const storageName in section) {
      const storage = section[storageName]
      const { makeKey, meta } = storageKeyMaker(api.registry, api.runtimeMetadata)(sectionName, storageName)
      if (meta.type.isPlain) {
        const key = makeKey()
        storageItems.push([key.toHex(), storage ? api.createType(key.outputType, storage).toHex(true) : null])
      } else {
        for (const [keys, value] of storage) {
          const key = makeKey(...keys)
          storageItems.push([key.toHex(), value ? api.createType(key.outputType, value).toHex(true) : null])
        }
      }
    }
  }
  return storageItems
}

export const setStorage = async (chain: Blockchain, storage: StorageValues, blockHash?: string): Promise<string> => {
  let storageItems: RawStorageValues
  if (Array.isArray(storage)) {
    storageItems = storage
  } else {
    storageItems = objectToStorageItems(chain.upstreamApi, storage)
  }
  const block = await chain.getBlock(blockHash)
  if (!block) throw Error(`Cannot find block ${blockHash || 'latest'}`)
  block.pushStorageLayer().setAll(storageItems)
  return block.hash
}
