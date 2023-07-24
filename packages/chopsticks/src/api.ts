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
          this.#provider.on('connected', (): void => {
            resolve()
          })
          this.#provider.connect()
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

  async getMetadata(hash?: string) {
    return this.#provider.send<string>('state_getMetadata', hash ? [hash] : [])
  }

  async getBlockHash(blockNumber?: number) {
    return this.#provider.send<HexString>('chain_getBlockHash', Number.isInteger(blockNumber) ? [blockNumber] : [])
  }

  async getHeader(hash?: string) {
    return this.#provider.send<Header>('chain_getHeader', hash ? [hash] : [])
  }

  async getBlock(hash?: string) {
    return this.#provider.send<SignedBlock>('chain_getBlock', hash ? [hash] : [])
  }

  async getStorage(key: string, hash?: string) {
    return this.#provider.send<string>('state_getStorage', [key, hash])
  }

  async getKeysPaged(prefix: string, pageSize: number, startKey: string, hash?: string) {
    return this.#provider.send<string[]>('state_getKeysPaged', [prefix, pageSize, startKey, hash])
  }
}
