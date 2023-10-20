import { EventEmitter } from 'eventemitter3'
import {
  ProviderInterface,
  ProviderInterfaceCallback,
  ProviderInterfaceEmitCb,
  ProviderInterfaceEmitted,
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

/**
 * Provider for local chopsticks chain
 */
export class ChopsticksProvider implements ProviderInterface {
  #isConnected = false
  #eventemitter: EventEmitter
  #isReadyPromise: Promise<void>
  #subscriptions: Record<string, Subscription> = {}

  constructor(public readonly chain: Blockchain) {
    this.#eventemitter = new EventEmitter()

    this.#isReadyPromise = new Promise((resolve, reject): void => {
      this.#eventemitter.once('connected', resolve)
      this.#eventemitter.once('error', reject)
      this.connect()
    })
  }

  static fromEndpoint = async (endpoint: string, block?: number | string | null, cache?: string) => {
    return new ChopsticksProvider(
      await setup({
        endpoint,
        mockSignatureHost: true,
        block,
        db: cache,
      }),
    )
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

  clone = () => {
    return new ChopsticksProvider(this.chain)
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

  subscriptionManager = {
    subscribe: (method: string, subid: string, onCancel: () => void = () => {}) => {
      const sub = this.#subscriptions[subid]
      if (sub) {
        sub.onCancel = onCancel
      }

      return (data: any) => {
        logger.debug('subscribe-callback', method, subid, data)
        const sub = this.#subscriptions[subid]
        if (!sub) {
          logger.trace(`Unable to find active subscription=${subid}`)
          return
        }
        sub.callback(null, data ? JSON.parse(JSON.stringify(data)) : data)
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
        sub.onCancel?.()
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
      logger.debug('send', { method, params })

      const rpcHandler = providerHandlers[method]
      if (!rpcHandler) {
        logger.error(`Unable to find rpc handler=${method}`)
        throw new Error(`Unable to find rpc handler=${method}`)
      }
      const result = await rpcHandler({ chain: this.chain }, params, this.subscriptionManager)
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

      return result ? JSON.parse(JSON.stringify(result)) : result
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
      return this.send<boolean>(method, [id])
    } catch {
      return false
    }
  }
}
