import { EventEmitter } from 'eventemitter3'
import {
  ProviderInterface,
  ProviderInterfaceCallback,
  ProviderInterfaceEmitCb,
  ProviderInterfaceEmitted,
  ProviderStats,
} from '@polkadot/rpc-provider/types'

import { Blockchain } from './blockchain'
import { StorageValues, setStorage } from './utils'
import { allHandlers } from './rpc'
import { defaultLogger } from './logger'
import { setup } from './setup'

const providerHandlers = {
  ...allHandlers,
  new_block: async (context: any, _params: any, _subscriptionManager: any) => {
    const { chain } = context
    const block = await chain.newBlock()
    return block
  },
}

const logger = defaultLogger.child({ name: '[Chopsticks provider]' })

interface SubscriptionHandler {
  callback: ProviderInterfaceCallback
  type: string
}

interface Subscription extends SubscriptionHandler {
  method: string
  params?: unknown[]
  onCancel?: () => void
  result?: unknown
}

export interface ChopsticksProviderProps {
  /** upstream endpoint */
  endpoint: string
  /** default to latest block */
  blockHash?: string
  dbPath?: string
  storageValues?: StorageValues
}

/**
 * A provider for ApiPromise.
 *
 * Currectly only support browser environment.
 */
export class ChopsticksProvider implements ProviderInterface {
  #isConnected = false
  #eventemitter: EventEmitter
  #isReadyPromise: Promise<void>
  #endpoint: string
  readonly stats?: ProviderStats
  #subscriptions: Record<string, Subscription> = {}
  #blockHash: string | undefined
  #dbPath: string | undefined
  #storageValues: StorageValues | undefined
  #chain: Blockchain | undefined

  constructor({ endpoint, blockHash, dbPath, storageValues }: ChopsticksProviderProps) {
    if (!endpoint) {
      throw new Error('ChopsticksProvider requires the upstream endpoint')
    }
    this.#endpoint = endpoint
    this.#blockHash = blockHash
    this.#dbPath = dbPath
    this.#storageValues = storageValues

    this.#eventemitter = new EventEmitter()

    this.#isReadyPromise = new Promise((resolve, reject): void => {
      this.#eventemitter.once('connected', (): void => {
        logger.debug('isReadyPromise: connected.')
        resolve()
      })
      this.#eventemitter.once('error', reject)
    })

    this.connect()
  }

  get hasSubscriptions(): boolean {
    return true
  }

  get isClonable(): boolean {
    return true
  }

  get isConnected(): boolean {
    return this.#isConnected
  }

  get isReady(): Promise<void> {
    return this.#isReadyPromise
  }

  clone = (): ProviderInterface => {
    return new ChopsticksProvider({ endpoint: this.#endpoint })
  }

  connect = async (): Promise<void> => {
    if (this.#isConnected) {
      return
    }
    try {
      logger.debug('connect: Initializing...')
      this.#chain = await setup({
        endpoint: this.#endpoint,
        mockSignatureHost: true,
        db: this.#dbPath,
        block: this.#blockHash,
      })
      logger.debug('connect: Chain setup done.')
      if (this.#storageValues) {
        await setStorage(this.#chain, this.#storageValues)
      }
      logger.debug('connect: Set storage done.')

      this.#isConnected = true
      this.#eventemitter.emit('connected')
    } catch (e) {
      logger.error('onMessage: connect error.', e)
    }
  }

  disconnect = async (): Promise<void> => {
    this.#isConnected = false
    if (this.#chain) {
      await this.#chain?.api.disconnect()
      await this.#chain?.close()
    }
  }

  on = (type: ProviderInterfaceEmitted, sub: ProviderInterfaceEmitCb): (() => void) => {
    this.#eventemitter.on(type, sub)

    return (): void => {
      this.#eventemitter.removeListener(type, sub)
    }
  }

  subscriptionManager = {
    subscribe: (method: string, subid: string, onCancel: () => void = () => {}) => {
      return (data: any) => {
        logger.debug('subscribe-callback', method, subid, data)
        const sub = this.#subscriptions[subid]
        if (!sub) {
          // sometimes callback comes first
          this.#subscriptions[subid] = {
            callback: () => {},
            method: method,
            type: 'unknown',
            result: data,
            onCancel,
          }
          return
        }
        sub.callback(null, data)
      }
    },
    unsubscribe: (subid: string) => {
      if (this.#subscriptions[subid]) {
        logger.debug('unsubscribe-callback', subid)
        const sub = this.#subscriptions[subid]
        if (!sub) {
          logger.error(`Unable to find active subscription=${subid}`)
          return
        }
        sub?.onCancel?.()
        delete this.#subscriptions[subid]
      }
    },
  }

  send = async <T>(
    method: string,
    params: unknown[],
    _isCacheable?: boolean,
    subscription?: SubscriptionHandler,
  ): Promise<T> => {
    try {
      if (!this.isConnected) {
        throw new Error('Api is not connected')
      }

      logger.debug('send', { method, params })

      const rpcHandler = providerHandlers[method]
      if (!rpcHandler) {
        logger.error(`Unable to find rpc handler=${method}`)
        throw new Error(`Unable to find rpc handler=${method}`)
      }
      const result = await rpcHandler({ chain: this.#chain }, params, this.subscriptionManager)
      logger.debug('send-result', { method, params, result })

      if (subscription) {
        // if it's a subscription, we usually returns the subid
        const subid = result as string
        if (subid) {
          if (!this.#subscriptions[subid]) {
            this.#subscriptions[subid] = {
              callback: subscription.callback,
              method,
              params,
              type: subscription.type,
            }
          }
        }
      }

      return result
    } catch (e) {
      logger.error('send error.', e)
      throw e
    }
  }

  subscribe(
    type: string,
    method: string,
    params: unknown[],
    callback: ProviderInterfaceCallback,
  ): Promise<number | string> {
    return this.send<string | number>(method, params, false, { callback, type })
  }

  async unsubscribe(_type: string, method: string, id: number | string): Promise<boolean> {
    if (!this.#subscriptions[id]) {
      logger.error(`Unable to find active subscription=${id}`)
      return false
    }

    try {
      return this.isConnected ? this.send<boolean>(method, [id]) : true
    } catch {
      return false
    }
  }
}
