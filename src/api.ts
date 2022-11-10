import { HexString } from '@polkadot/util/types'
import { ProviderInterface } from '@polkadot/rpc-provider/types'

type ChainProperties = {
  ss58Format?: number
  tokenDecimals?: number[]
  tokenSymbol?: string[]
}

type Header = {
  parentHash: HexString
  number: HexString
  stateRoot: HexString
  extrinsicsRoot: HexString
  digest: {
    logs: HexString[]
  }
}

type SignedBlock = {
  block: {
    header: Header
    extrinsics: HexString[]
  }
  justifications?: HexString[]
}

export class Api {
  #provider: ProviderInterface
  #isReady: Promise<void>

  #chainProperties: Promise<ChainProperties>

  constructor(provider: ProviderInterface) {
    this.#provider = provider
    this.#isReady = new Promise((resolve, reject) => {
      if (this.#provider.isConnected) {
        setTimeout(resolve, 500)
      } else {
        this.#provider.on('connected', () => {
          setTimeout(resolve, 500)
        })
      }
      this.#provider.on('error', reject)
    })

    this.#provider.on('disconnected', () => {
      // TODO: reconnect
      console.warn('Api disconnected')
    })

    this.#chainProperties = this.#isReady.then(() => this.getSystemProperties())

    this.#provider.connect()
  }

  async disconnect() {
    return this.#provider.disconnect()
  }

  get isReady() {
    return this.#isReady
  }

  async chainProperties() {
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

  async getMetadata(hash?: string) {
    return this.#provider.send<string>('state_getMetadata', [hash])
  }

  async getBlockHash(blockNumber?: number) {
    return this.#provider.send<string>('chain_getBlockHash', [blockNumber])
  }

  async getHeader(hash?: string) {
    return this.#provider.send<Header>('chain_getHeader', [hash])
  }

  async getBlock(hash?: string) {
    return this.#provider.send<SignedBlock>('chain_getBlock', [hash])
  }

  async getStorage(key: string, hash?: string) {
    return this.#provider.send<string>(hash ? 'state_getStorageAt' : 'state_getStorage', [key, hash])
  }

  async getKeysPaged(prefix: string, pageSize: number, startKey: string, hash?: string) {
    return this.#provider.send<string[]>(hash ? 'state_getKeysPagedAt' : 'state_getKeysPaged', [
      prefix,
      pageSize,
      startKey,
      hash,
    ])
  }
}
