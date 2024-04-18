import { ExtDef } from '@polkadot/types/extrinsic/signedExtensions/types'
import { HexString } from '@polkadot/util/types'
import { ProviderInterface, ProviderInterfaceCallback } from '@polkadot/rpc-provider/types'
import _ from 'lodash'

import { ChainProperties, Header, SignedBlock } from './index.js'
import { prefixedChildKey, splitChildKey, stripChildPrefix } from './utils/index.js'

/**
 * API class. Calls provider to get on-chain data.
 * Either `endpoint` or `genesis` porvider must be provided.
 *
 * @example Instantiate an API
 *
 * ```ts
 * const provider = new WsProvider(options.endpoint)
 * const api = new Api(provider)
 * await api.isReady
 * ```
 */
export class Api {
  #provider: ProviderInterface
  #ready: Promise<void> | undefined
  #chain: Promise<string> | undefined
  #chainProperties: Promise<ChainProperties> | undefined

  readonly signedExtensions: ExtDef

  constructor(provider: ProviderInterface, signedExtensions?: ExtDef) {
    this.#provider = provider
    this.signedExtensions = signedExtensions || {}
  }

  async disconnect() {
    return this.#provider.disconnect()
  }

  get isReady() {
    if (!this.#ready) {
      if (this.#provider['isReady']) {
        this.#ready = this.#provider['isReady']
      } else {
        this.#ready = new Promise((resolve): void => {
          if (this.#provider.hasSubscriptions) {
            this.#provider.on('connected', resolve)
            this.#provider.connect()
          } else {
            resolve()
          }
        })
      }
    }

    return this.#ready
  }

  get chain(): Promise<string> {
    if (!this.#chain) {
      this.#chain = this.getSystemChain()
    }
    return this.#chain
  }

  get chainProperties(): Promise<ChainProperties> {
    if (!this.#chainProperties) {
      this.#chainProperties = this.getSystemProperties()
    }
    return this.#chainProperties
  }

  async getSystemName() {
    return this.#provider.send<string>('system_name', [])
  }

  async getSystemProperties() {
    return this.#provider.send<ChainProperties>('system_properties', [])
  }

  async getSystemChain() {
    return this.#provider.send<string>('system_chain', [])
  }

  async getBlockHash(blockNumber?: number) {
    return this.#provider.send<HexString | null>(
      'chain_getBlockHash',
      Number.isInteger(blockNumber) ? [blockNumber] : [],
      !!blockNumber,
    )
  }

  async getHeader(hash?: string) {
    return this.#provider.send<Header | null>('chain_getHeader', hash ? [hash] : [], !!hash)
  }

  async getBlock(hash?: string) {
    return this.#provider.send<SignedBlock | null>('chain_getBlock', hash ? [hash] : [], !!hash)
  }

  async getStorage(key: string, hash?: string) {
    const [child, storageKey] = splitChildKey(key as HexString)
    if (child) {
      // child storage key, use childstate_getStorage
      const params = [child, storageKey]
      if (hash) params.push(hash as HexString)
      return this.#provider.send<HexString | null>('childstate_getStorage', params, !!hash)
    } else {
      // main storage key, use state_getStorage
      const params = [key]
      if (hash) params.push(hash)
      return this.#provider.send<HexString | null>('state_getStorage', params, !!hash)
    }
  }

  async getKeysPaged(prefix: string, pageSize: number, startKey: string, hash?: string) {
    const [child, storageKey] = splitChildKey(prefix as HexString)
    if (child) {
      // child storage key, use childstate_getKeysPaged
      // strip child prefix from startKey
      const params = [child, storageKey, pageSize, stripChildPrefix(startKey as HexString)]
      if (hash) params.push(hash as HexString)
      return this.#provider
        .send<HexString[]>('childstate_getKeysPaged', params, !!hash)
        .then((keys) => keys.map((key) => prefixedChildKey(child, key)))
    } else {
      // main storage key, use state_getKeysPaged
      const params = [prefix, pageSize, startKey]
      if (hash) params.push(hash)
      return this.#provider.send<HexString[]>('state_getKeysPaged', params, !!hash)
    }
  }

  async getStorageBatch(prefix: HexString, keys: HexString[], hash?: HexString) {
    const [child] = splitChildKey(prefix)
    if (child) {
      // child storage key, use childstate_getStorageEntries
      // strip child prefix from keys
      const params: any[] = [child, keys.map((key) => stripChildPrefix(key))]
      if (hash) params.push(hash)
      return this.#provider
        .send<HexString[]>('childstate_getStorageEntries', params, !!hash)
        .then((values) => _.zip(keys, values) as [HexString, HexString | null][])
    } else {
      // main storage key, use state_getStorageAt
      const params: any[] = [keys]
      if (hash) params.push(hash)
      return this.#provider
        .send<HexString[]>('state_queryStorageAt', params, !!hash)
        .then((result) => (result[0]?.['changes'] as [HexString, HexString | null][]) || [])
    }
  }

  async subscribeRemoteNewHeads(cb: ProviderInterfaceCallback) {
    if (!this.#provider.hasSubscriptions) {
      throw new Error('subscribeRemoteNewHeads only works with subscriptions')
    }
    return this.#provider.subscribe('chain_newHead', 'chain_subscribeNewHeads', [], cb)
  }

  async subscribeRemoteFinalizedHeads(cb: ProviderInterfaceCallback) {
    if (!this.#provider.hasSubscriptions) {
      throw new Error('subscribeRemoteFinalizedHeads only works with subscriptions')
    }
    return this.#provider.subscribe('chain_finalizedHead', 'chain_subscribeFinalizedHeads', [], cb)
  }
}
