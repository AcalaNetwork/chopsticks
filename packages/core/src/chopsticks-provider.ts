import { EventEmitter } from 'eventemitter3'
import {
  ProviderInterface,
  ProviderInterfaceCallback,
  ProviderInterfaceEmitCb,
  ProviderInterfaceEmitted,
  ProviderStats,
} from '@polkadot/rpc-provider/types'
import { truncate } from 'lodash'

import { Blockchain } from './blockchain'
import { allHandlers } from './rpc'
import { defaultLogger } from './logger'
import { setStorage } from './utils'
import { setup } from './setup'

interface SubscriptionHandler {
  callback: ProviderInterfaceCallback
  type: string
}

interface Subscription extends SubscriptionHandler {
  method: string
  params: unknown[]
  onCancel?: () => void
}

export interface ChopsticksProviderProps {
  /** upstream endpoint */
  endpoint: string | undefined
  /** default to latest block */
  blockHash?: string
}

/**
 * A provider for ApiPromise
 */
export class ChopsticksProvider implements ProviderInterface {
  #isConnected = false
  #eventemitter: EventEmitter
  #isReadyPromise: Promise<void>
  #chainPromise: Promise<Blockchain>
  #chain: Blockchain | undefined
  #endpoint: string
  readonly stats?: ProviderStats
  #subscriptions: Record<string, Subscription> = {}

  constructor({ endpoint, blockHash }: ChopsticksProviderProps) {
    if (!endpoint) {
      throw new Error('ChopsticksProvider requires the upstream endpoint')
    }
    this.#endpoint = endpoint
    // FIXME: WARNING in /node_modules/typeorm/browser/driver/react-native/ReactNativeDriver.js
    // see: https://github.com/typeorm/typeorm/issues/2158
    // this repo may not have this problem since using vite, but polkadot.js app will have
    this.#chainPromise = setup({
      endpoint: endpoint,
      mockSignatureHost: true,
      db: 'chopsticks.db',
      block: blockHash,
    })

    this.#eventemitter = new EventEmitter()

    this.connect()

    this.#isReadyPromise = new Promise((resolve, reject): void => {
      this.#eventemitter.once('connected', (): void => {
        resolve()
      })
      this.#eventemitter.once('error', reject)
    })
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

  get chain() {
    return this.#chainPromise
  }

  clone = (): ProviderInterface => {
    return new ChopsticksProvider({ endpoint: this.#endpoint })
  }

  connect = async (): Promise<void> => {
    return this.#chainPromise
      .then((chain) => {
        this.#chain = chain
        return setStorage(chain, {
          System: {
            Account: [
              [
                ['5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY'],
                {
                  providers: 1,
                  data: {
                    free: '1000000000000000000',
                  },
                },
              ],
            ],
          },
        })
      })
      .then(() => {
        this.#isConnected = true
        this.#eventemitter.emit('connected')
      })
  }

  disconnect = async (): Promise<void> => {
    await this.#chain?.api?.disconnect()
    await this.#chain?.close()
    this.#isConnected = false
    this.#eventemitter.emit('disconnected')
  }

  on = (type: ProviderInterfaceEmitted, sub: ProviderInterfaceEmitCb): (() => void) => {
    this.#eventemitter.on(type, sub)

    return (): void => {
      this.#eventemitter.removeListener(type, sub)
    }
  }

  #subscriptionManager = {
    subscribe: (method: string, subid: string, onCancel: () => void = () => {}) => {
      if (this.#subscriptions[subid]) this.#subscriptions[subid].onCancel = onCancel
      return (data: any) => {
        if (this.#subscriptions[subid]) {
          defaultLogger.trace({ method, subid, data: truncate(data) }, 'Subscription notification')
          this.#subscriptions[subid].callback(null, data)
        }
      }
    },
    unsubscribe: (subid: string) => {
      if (this.#subscriptions[subid]) {
        this.#subscriptions[subid].onCancel?.()
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
    await this.isReady
    const handler = allHandlers[method]
    if (!handler) {
      defaultLogger.error(`Unable to find handler=${method}`)
      return Promise.reject(new Error(`Unable to find handler=${method}`))
    }
    if (subscription) {
      const subid = `${subscription.type}::${method}`
      this.#subscriptions[subid] = {
        callback: subscription.callback,
        method,
        params,
        type: subscription.type,
      }
    }
    defaultLogger.debug({ method, params }, `Calling handler`)
    const result = await handler({ chain: this.#chain! }, params, this.#subscriptionManager)
    return result
  }

  subscribe(
    type: string,
    method: string,
    params: unknown[],
    callback: ProviderInterfaceCallback,
  ): Promise<number | string> {
    return this.send<string | number>(method, params, false, { callback, type })
  }

  async unsubscribe(type: string, method: string, id: number | string): Promise<boolean> {
    const subscription = `${type}::${id}`

    if (!this.#subscriptions[subscription]) {
      defaultLogger.debug(`Unable to find active subscription=${subscription}`)
      return false
    }

    delete this.#subscriptions[subscription]

    try {
      return this.isConnected && this.#chain ? this.send<boolean>(method, [id]) : true
    } catch {
      return false
    }
  }
}
