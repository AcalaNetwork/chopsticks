import { ApiPromise } from '@polkadot/api'
import { DecoratedMeta, ModuleStorage } from '@polkadot/types/metadata/decorate/types'
import { HexString } from '@polkadot/util/types'
import { Logger } from 'pino'
import { SqliteDatabase } from '@acala-network/chopsticks-db'
import { StorageEntry } from '@polkadot/types/primitive/types'
import { StorageEntryMetadataLatest } from '@polkadot/types/interfaces'
import { compactStripLength, stringCamelCase, u8aToHex } from '@polkadot/util'
import { expandMetadata } from '@polkadot/types'
import { xxhashAsHex } from '@polkadot/util-crypto'

const BATCH_SIZE = 1000

type FetchStorageConfigItem =
  | HexString
  | string
  | Record<string, string | Record<string, any[]> | Record<string, any>[] | (string | any)[]>
export type FetchStorageConfig = FetchStorageConfigItem[]

const getHexKeyWithArgs = (meta: StorageEntryMetadataLatest, storage: any, args: Record<string, any>[]) => {
  const isPartialKey = args.length !== (meta.type.isPlain ? 0 : meta.type.asMap.hashers.length)

  const hexKey =
    isPartialKey && storage.creator.iterKey
      ? storage.creator.iterKey(...args).toHex()
      : u8aToHex(compactStripLength(storage.creator(...args))[1])

  return hexKey
}

const checkPalletStorageByName = <T extends boolean>(
  meta: DecoratedMeta,
  palletName: string,
  storageName?: string,
): { pallet: ModuleStorage; storage: T extends true ? StorageEntry : undefined } => {
  const pallet = meta.query[stringCamelCase(palletName)]
  if (!pallet) throw Error(`Cannot find pallet ${palletName}`)

  let storage
  if (storageName) {
    storage = pallet[stringCamelCase(storageName)]
    if (!storage) throw Error(`Cannot find storage ${storageName} in pallet ${palletName}`)
  }

  return { pallet, storage }
}

export const getPrefixesFromConfig = async (config: FetchStorageConfig, api: ApiPromise) => {
  const prefixes: string[] = []

  const metadata = await api.rpc.state.getMetadata()
  const expandMeta = expandMetadata(metadata.registry, metadata)

  for (const item of config) {
    if (typeof item === 'string' && item.startsWith('0x')) {
      // hex string
      prefixes.push(item)
    } else if (typeof item === 'string' && !item.includes('.')) {
      // pallet name
      checkPalletStorageByName(expandMeta, item)
      prefixes.push(xxhashAsHex(item, 128))
    } else if (typeof item === 'string' && item.includes('.')) {
      // pallet.storage
      const [palletName, storageName] = item.split('.')
      const { storage } = checkPalletStorageByName<true>(expandMeta, palletName, storageName)
      prefixes.push(u8aToHex(storage.keyPrefix()))
    } else if (typeof item === 'object') {
      // object cases
      const [objectKey, objectVal] = Object.entries(item)[0]

      if (typeof objectVal === 'string') {
        // - System: Account
        const { storage } = checkPalletStorageByName<true>(expandMeta, objectKey, objectVal)
        prefixes.push(u8aToHex(storage.keyPrefix()))
      } else if (objectKey.includes('.') && Array.isArray(objectVal)) {
        // - Pallet.Storage: [xxx, ...]
        const [pallet, storage] = objectKey.split('.').map((x) => stringCamelCase(x))
        checkPalletStorageByName<true>(expandMeta, pallet, storage)
        const storageEntry = api.query[pallet][storage]
        const meta = storageEntry.creator.meta
        const args = objectVal
        const hexKey = getHexKeyWithArgs(meta, storageEntry, args)
        prefixes.push(hexKey)
      } else if (!Array.isArray(objectVal)) {
        // - Tokens:
        //     Accounts: [xxx, ...]
        const pallet = stringCamelCase(objectKey)
        const [storage, args] = Object.entries(objectVal)[0]
        checkPalletStorageByName<true>(expandMeta, pallet, storage)
        const storageEntry = api.query[pallet][stringCamelCase(storage)]
        const meta = storageEntry.creator.meta
        const hexKey = getHexKeyWithArgs(meta, storageEntry, args)
        prefixes.push(hexKey)
      } else {
        throw new Error(`Unsupported fetch-storage config: ${objectKey}.${objectVal}`)
      }
    }
  }

  return prefixes
}

export const fetchStorage = async (
  at: string,
  dbPath: string,
  api: ApiPromise,
  config: FetchStorageConfig,
  logger: Logger,
) => {
  const prefixes = await getPrefixesFromConfig(config, api)
  const apiAt = await api.at(at)

  const db = new SqliteDatabase(dbPath)
}
