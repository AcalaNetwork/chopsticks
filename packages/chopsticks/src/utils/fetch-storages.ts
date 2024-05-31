import { Api, defaultLogger } from '@acala-network/chopsticks-core'
import { ApiPromise } from '@polkadot/api'
import { DecoratedMeta, ModuleStorage } from '@polkadot/types/metadata/decorate/types'
import { HexString } from '@polkadot/util/types'
import { SqliteDatabase } from '@acala-network/chopsticks-db'
import { StorageEntry } from '@polkadot/types/primitive/types'
import { StorageEntryMetadataLatest } from '@polkadot/types/interfaces'
import { WsProvider } from '@polkadot/rpc-provider'
import { compactStripLength, stringCamelCase, u8aToHex } from '@polkadot/util'
import { expandMetadata } from '@polkadot/types'
import { wrap } from 'comlink'
import { xxhashAsHex } from '@polkadot/util-crypto'
import _ from 'lodash'
import nodeEndpoint from 'comlink/dist/umd/node-adapter.js'
import threads from 'node:worker_threads'

const BATCH_SIZE = 1000

export const logger = defaultLogger.child({ name: 'fetch-storages' })

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

/**
 * Convert fetch-storage configs to prefixes for fetching.
 */
export const getPrefixesFromConfig = async (config: FetchStorageConfig, api: ApiPromise) => {
  logger.debug({ config }, 'received fetch-storage config')
  const prefixes: string[] = []

  const metadata = await api.rpc.state.getMetadata()
  const expandMeta = expandMetadata(metadata.registry, metadata)

  for (const item of config) {
    if (typeof item === 'string' && item.startsWith('0x')) {
      // hex
      prefixes.push(item)
    } else if (typeof item === 'string' && !item.includes('.')) {
      // pallet
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

  logger.debug({ prefixes }, 'prefixes from config')

  return prefixes
}

type FetchStoragesParams = {
  block?: number | string | null
  endpoint?: string | string[]
  dbPath?: string
  config: FetchStorageConfig
}

/**
 * Fetch storages and save in a local db
 */
export const fetchStorages = async ({ block, endpoint, dbPath, config }: FetchStoragesParams) => {
  if (!endpoint) throw new Error('endpoint is required')
  if (!block) throw new Error('block is required')

  const provider = new WsProvider(endpoint, 3_000)
  const apiPromise = new ApiPromise({ provider })
  await apiPromise.isReady

  let blockHash: string
  if (block == null) {
    const lastHdr = await apiPromise.rpc.chain.getHeader()
    blockHash = lastHdr.hash.toString()
  } else if (typeof block === 'string' && block.startsWith('0x')) {
    blockHash = block as string
  } else if (Number.isInteger(+block)) {
    blockHash = await apiPromise.rpc.chain.getBlockHash(Number(block)).then((h) => h.toString())
  } else {
    throw new Error(`Invalid block number or hash: ${block}`)
  }
  const signedBlock = await apiPromise.rpc.chain.getBlock(blockHash)
  const blockNumber = signedBlock.block.header.number.toNumber()
  const chainName = (await apiPromise.rpc.system.chain()).toString()

  const prefixesFromConfig = await getPrefixesFromConfig(config, apiPromise)
  const uniqPrefixes = _.uniq(prefixesFromConfig)

  const processPrefixes = (prefixes: string[]) => {
    prefixes.sort()
    const result: string[] = []
    for (const prefix of prefixes) {
      // check if the current prefix is not a prefix of any added prefix
      if (!result.some((prev) => prefix.startsWith(prev))) {
        result.push(prefix)
      }
    }
    return result
  }

  const prefixes = processPrefixes(uniqPrefixes)
  logger.debug({ prefixes }, 'prefixes from config')

  if (!prefixes.length) throw new Error('No prefixes to fetch')

  const api = new Api(provider)
  const db = new SqliteDatabase(dbPath ?? `db-${chainName}-${blockNumber}.sqlite`)

  for (const prefix of prefixes) {
    let startKey = '0x'
    let hasMorePages = true

    while (hasMorePages) {
      logger.debug({ prefix, startKey }, 'fetching keys')
      const keysPage = await api.getKeysPaged(prefix, BATCH_SIZE, startKey, blockHash)
      logger.debug({ prefix, startKey }, `fetched ${keysPage.length} keys`)
      startKey = keysPage[keysPage.length - 1]
      if (!keysPage || keysPage.length < BATCH_SIZE) {
        hasMorePages = false
      }

      logger.debug({ prefix }, 'fetching storages')
      const storages = await api.getStorageBatch(prefix as HexString, keysPage as HexString[], blockHash as HexString)
      logger.debug({ prefix }, `fetched ${storages.length} storages`)

      const keyValueEntries = storages.map(([key, value]) => ({ blockHash, key, value }))
      await db.saveStorageBatch(keyValueEntries)
      logger.debug({ prefix }, `saved ${storages.length} storages ✅`)
    }
  }
}

export const startFetchStorageWorker = async (options: FetchStoragesParams) => {
  if (!options.config) return null

  const worker = new threads.Worker(new URL('fetch-storages-worker.js', import.meta.url), {
    name: 'fetch-storages-worker',
  })
  worker.on('error', (err) => {
    logger.error(err, 'error from worker')
  })
  const workerApi = wrap<{ startFetch: (options: FetchStoragesParams) => void }>((nodeEndpoint as any)(worker))
  workerApi.startFetch(options)
  return {
    worker: workerApi,
    terminate: async () => {
      await worker.terminate()
    },
  }
}
