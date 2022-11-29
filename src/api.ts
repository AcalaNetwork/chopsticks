import { ExtDef } from '@polkadot/types/extrinsic/signedExtensions/types'
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
  #chain: Promise<string>
  #chainProperties: Promise<ChainProperties>

  readonly signedExtensions: ExtDef

  constructor(provider: ProviderInterface, signedExtensions?: ExtDef) {
    this.#provider = provider
    this.signedExtensions = signedExtensions || {}
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

    this.#chain = this.#isReady.then(() => this.getSystemChain())
    this.#chainProperties = this.#isReady.then(() => this.getSystemProperties())

    this.#provider.connect()
  }

  async disconnect() {
    return this.#provider.disconnect()
  }

  get isReady() {
    return this.#isReady
  }

  get chain(): Promise<string> {
    return this.#chain
  }

  get chainProperties(): Promise<ChainProperties> {
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
    return this.#provider.send<string>('state_getMetadata', hash ? [hash] : [])
  }

  async getBlockHash(blockNumber?: number) {
    return this.#provider.send<string>('chain_getBlockHash', Number.isInteger(blockNumber) ? [blockNumber] : [])
  }

  async getHeader(hash?: string) {
    return this.#provider.send<Header>('chain_getHeader', hash ? [hash] : [])
  }

  async getBlock(hash?: string) {
    return this.#provider.send<SignedBlock>('chain_getBlock', hash ? [hash] : [])
  }

  async getStorage(key: string, hash?: string) {
    if (hash) {
      return this.#provider.send<string>('state_getStorageAt', [key, hash])
    }
    return this.#provider.send<string>('state_getStorage', [key])
  }

  async getKeysPaged(prefix: string, pageSize: number, startKey: string, hash?: string) {
    if (hash) {
      return this.#provider.send<string[]>('state_getKeysPagedAt', [prefix, pageSize, startKey, hash])
    }
    return this.#provider.send<string[]>('state_getKeysPaged', [prefix, pageSize, startKey])
  }
}
