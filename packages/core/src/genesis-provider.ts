import { EventEmitter } from 'eventemitter3'
import { HexString } from '@polkadot/util/types'
import {
  ProviderInterface,
  ProviderInterfaceCallback,
  ProviderInterfaceEmitCb,
  ProviderInterfaceEmitted,
  ProviderStats,
} from '@polkadot/rpc-provider/types'

import { Genesis, genesisSchema } from './schema'
import { JsCallback, calculateStateRoot, emptyTaskHandler } from './wasm-executor'

export class GenesisProvider implements ProviderInterface {
  #isConnected = false

  readonly stats?: ProviderStats

  #eventemitter: EventEmitter
  #isReadyPromise: Promise<void>

  #genesis: Genesis
  #stateRoot: Promise<HexString>

  constructor(genesis: Genesis) {
    this.#genesis = genesisSchema.parse(genesis)
    this.#stateRoot = calculateStateRoot(
      Object.entries(this.#genesis.genesis.raw.top).reduce(
        (accu, item) => {
          accu.push(item as any)
          return accu
        },
        [] as [HexString, HexString][],
      ),
      1,
    )

    this.#eventemitter = new EventEmitter()

    this.#isReadyPromise = new Promise((resolve, reject): void => {
      this.#eventemitter.once('connected', (): void => {
        resolve()
      })
      this.#eventemitter.once('error', reject)
      this.connect()
    })
  }

  get isClonable(): boolean {
    return true
  }

  clone = (): ProviderInterface => {
    return new GenesisProvider(this.#genesis)
  }

  get hasSubscriptions(): boolean {
    return false
  }

  get isConnected(): boolean {
    return this.#isConnected
  }

  get isReady(): Promise<void> {
    return this.#isReadyPromise
  }

  connect = async (): Promise<void> => {
    this.#isConnected = true
    this.#eventemitter.emit('connected')
  }

  disconnect = async (): Promise<void> => {
    this.#isConnected = false
    this.#eventemitter.emit('disconnected')
  }

  on = (type: ProviderInterfaceEmitted, sub: ProviderInterfaceEmitCb): (() => void) => {
    this.#eventemitter.on(type, sub)

    return (): void => {
      this.#eventemitter.removeListener(type, sub)
    }
  }

  get blockHash(): HexString {
    return '0x91b171bb158e2d3848fa23a9f1c25182fb8e20313b2c1eb49219da7a70ce90c3'
  }

  getHeader = async () => {
    return {
      blockHash: this.blockHash,
      number: 0,
      stateRoot: await this.#stateRoot,
      digest: {
        logs: [],
      },
    }
  }

  getBlock = async () => {
    return {
      block: {
        header: await this.getHeader(),
        extrinsics: [],
      },
    }
  }

  get _jsCallback(): JsCallback {
    const storage = this.#genesis.genesis.raw.top
    return {
      ...emptyTaskHandler,
      getStorage: async function (key: HexString) {
        return storage[key]
      },
      getStateRoot: async function () {
        return '0x49416764844ff0d8bad851e8abe686dff9dd2de78621180ef8e9f99bb7a480f1'
      },
      getNextKey: async function (_prefix: HexString, _key: HexString) {
        return undefined
      },
    }
  }

  send = async (method: string, params: unknown[], _isCacheable?: boolean): Promise<any> => {
    await this.isReady
    switch (method) {
      case 'system_properties':
        return this.#genesis.properties
      case 'system_chain':
        return this.#genesis.id
      case 'system_name':
        return this.#genesis.name
      case 'chain_getHeader':
        return this.getHeader()
      case 'chain_getBlock':
        return this.getBlock()
      case 'chain_getBlockHash':
        return this.blockHash
      case 'state_getKeysPaged':
      case 'state_getKeysPagedAt':
        return []
      case 'state_getStorage':
      case 'state_getStorageAt':
        return this.#genesis.genesis.raw.top[params[0] as HexString]
      default:
        throw Error(`${method} not implemented`)
    }
  }

  subscribe = async (
    _type: string,
    _method: string,
    _params: unknown[],
    _cb: ProviderInterfaceCallback,
  ): Promise<number | string> => {
    throw Error('unimplemented')
  }

  unsubscribe = async (_type: string, _method: string, _id: number | string): Promise<boolean> => {
    throw Error('unimplemented')
  }
}
