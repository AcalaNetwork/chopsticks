import { ExtDef } from '@polkadot/types/extrinsic/signedExtensions/types'
import { HexString } from '@polkadot/util/types'
import { ProviderInterfaceCallback } from '@polkadot/rpc-provider/types'
import { TypeRegistry } from '@polkadot/types'
import { hexToU8a } from '@polkadot/util'

import { ApiT } from './api.js'
import { ChainProperties, Header, SignedBlock } from './index.js'
import { LightClient, LightClientConfig } from './wasm-executor/light-client.js'

export type { LightClientConfig }

export class P2P extends LightClient implements ApiT {
  // to decode header
  #registry = new TypeRegistry()

  static async create(config: LightClientConfig, fallback: ApiT) {
    await fallback.isReady
    const client = new P2P(config, fallback)
    await client.isReady
    return client
  }

  constructor(config: LightClientConfig, fallback: ApiT) {
    super(config, fallback)
  }

  get signedExtensions(): ExtDef {
    return this.fallback.signedExtensions
  }

  get chain() {
    return this.fallback.chain
  }

  get chainProperties() {
    return this.fallback.chainProperties
  }

  get isReady() {
    return super.isReady
  }

  async disconnect(): Promise<void> {
    return this.fallback.disconnect()
  }

  async getSystemName(): Promise<string> {
    return this.fallback.getSystemName()
  }

  async getSystemProperties(): Promise<ChainProperties> {
    return this.fallback.getSystemProperties()
  }

  async getSystemChain(): Promise<string> {
    return this.fallback.getSystemChain()
  }

  async getBlockHash(blockNumber?: number): Promise<HexString | null> {
    if (!blockNumber && blockNumber != 0) {
      ;[blockNumber] = await this.getLatestBlock()
    }
    try {
      return this.queryBlock(blockNumber).then(({ hash }) => hash)
    } catch (_) {
      return this.fallback.getBlockHash(blockNumber)
    }
  }

  async getHeader(hash?: string): Promise<Header | null> {
    if (!hash) {
      ;[, hash] = await this.getLatestBlock()
    }
    try {
      const block = await this.queryBlock(hash as HexString)
      return this.#registry.createType('Header', hexToU8a(block.header)).toJSON() as Header
    } catch (_) {
      return this.fallback.getHeader(hash)
    }
  }

  async getBlock(hash?: string): Promise<SignedBlock | null> {
    if (!hash) {
      ;[, hash] = await this.getLatestBlock()
    }
    try {
      const block = await this.queryBlock(hash as HexString)
      const header = this.#registry.createType('Header', hexToU8a(block.header)).toJSON() as Header
      return { block: { header, extrinsics: block.body }, justifications: [] }
    } catch (_) {
      return this.fallback.getBlock(hash)
    }
  }

  async getStorage(key: string, hash?: string): Promise<HexString | null> {
    if (!hash) {
      ;[, hash] = await this.getLatestBlock()
    }
    const storage = await this.queryStorage([key as HexString], hash as HexString)
    const pair = storage.find(([k]) => k === key)
    return pair?.[1] || null
  }

  async getStorageBatch(
    _prefix: HexString,
    keys: HexString[],
    hash?: HexString,
  ): Promise<[HexString, HexString | null][]> {
    if (!hash) {
      ;[, hash] = await this.getLatestBlock()
    }
    return this.queryStorage(keys, hash as HexString)
  }

  async getKeysPaged(prefix: string, pageSize: number, startKey: string, hash?: string): Promise<HexString[]> {
    return this.fallback.getKeysPaged(prefix, pageSize, startKey, hash)
  }

  async subscribeRemoteNewHeads(cb: ProviderInterfaceCallback): Promise<string | number> {
    return this.fallback.subscribeRemoteNewHeads(cb)
  }

  async subscribeRemoteFinalizedHeads(cb: ProviderInterfaceCallback): Promise<string | number> {
    return this.fallback.subscribeRemoteFinalizedHeads(cb)
  }
}
