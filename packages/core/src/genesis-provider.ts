import { EventEmitter } from 'eventemitter3'
import { HexString } from '@polkadot/util/types'
import {
  ProviderInterface,
  ProviderInterfaceCallback,
  ProviderInterfaceEmitCb,
  ProviderInterfaceEmitted,
} from '@polkadot/rpc-provider/types'

import { Genesis, genesisSchema } from './schema/index.js'
import { JsCallback, calculateStateRoot, emptyTaskHandler } from './wasm-executor/index.js'
import { defaultLogger, isPrefixedChildKey } from './index.js'

/**
 * Provider to start a chain from genesis
 */
export class GenesisProvider implements ProviderInterface {
  #isConnected = false

  #eventemitter = new EventEmitter()
  #isReadyPromise: Promise<void>

  #genesis: Genesis
  #stateRoot: Promise<HexString>

  public genesisHeaderLogs: HexString[] = []

  /**
   * @ignore
   * Create a genesis provider
   *
   * @param genesis - genesis file
   * @requires genesis provider
   */
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

  clone = (): GenesisProvider => {
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
    return '0x4545454545454545454545454545454545454545454545454545454545454545'
  }

  getHeader = async () => {
    return {
      number: '0x0' as HexString,
      stateRoot: await this.#stateRoot,
      parentHash: '0x4545454545454545454545454545454545454545454545454545454545454545',
      extrinsicsRoot: '0x03170a2e7597b7b7e3d84c05391d139a62b157e78786d8c082f29dcf4c111314',
      digest: {
        logs: this.genesisHeaderLogs,
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
        if (isPrefixedChildKey(key)) {
          defaultLogger.warn({ key }, 'genesis child storage not supported')
          return undefined
        }
        return storage[key]
      },
      getNextKey: async function (prefix: HexString, key: HexString) {
        if (isPrefixedChildKey(key)) {
          defaultLogger.warn({ prefix, key }, 'genesis child storage not supported')
          return undefined
        }
        return Object.keys(storage).find((k) => {
          if (!k.startsWith(prefix)) return false
          if (key.length > prefix.length) {
            return k > key
          }
          return true
        })
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
      case 'state_getKeysPagedAt': {
        if (params.length < 2) throw Error('invalid params')
        const [prefix, size, start] = params as [HexString, number, HexString?]
        let startKey = start || prefix
        const keys: string[] = []
        while (keys.length < size) {
          const nextKey = await this._jsCallback.getNextKey(prefix, startKey)
          if (!nextKey) break
          keys.push(nextKey)
          startKey = nextKey as HexString
        }
        return keys
      }
      case 'state_getStorage':
      case 'state_getStorageAt': {
        if (params.length < 1) throw Error('invalid params')
        return this.#genesis.genesis.raw.top[params[0] as HexString]
      }
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
