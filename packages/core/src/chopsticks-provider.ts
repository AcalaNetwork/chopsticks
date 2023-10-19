import { EventEmitter } from 'eventemitter3'
import {
  ProviderInterface,
  ProviderInterfaceCallback,
  ProviderInterfaceEmitCb,
  ProviderInterfaceEmitted,
  ProviderStats,
} from '@polkadot/rpc-provider/types'

import { Blockchain } from './blockchain'
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
  /** chopsticks Blockchain type */
  chain?: Blockchain
}

/**
 * A provider for ApiPromise.
 *
 */
export class ChopsticksProvider implements ProviderInterface {
  #isConnected = false
  #eventemitter: EventEmitter
  #isReadyPromise: Promise<void>
  readonly stats?: ProviderStats
  #subscriptions: Record<string, Subscription> = {}
  #chain: Blockchain

  constructor({ chain }: ChopsticksProviderProps) {
    if (!chain) {
      throw new Error('ChopsticksProvider requires a blockchain instance.')
    }
    this.#chain = chain

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

  static fromEndpoint = async (endpoint: string) => {
    const chain = await setup({
      endpoint,
      mockSignatureHost: true,
    })
    const provider = new ChopsticksProvider({ chain })
    return provider
  }

  get hasSubscriptions(): boolean {
    return true
  }

  get isClonable(): boolean {
    return false
  }

  get isConnected(): boolean {
    return this.#isConnected
  }

  get isReady(): Promise<void> {
    return this.#isReadyPromise
  }

  get chain(): Blockchain {
    if (!this.#chain) {
      throw new Error('ChopsticksProvider is not connected')
    }
    return this.#chain
  }

  clone = () => {
    throw new Error('ChopsticksProvider is not clonable')
  }

  connect = async (): Promise<void> => {
    if (this.#isConnected) return
    try {
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
