import { EventEmitter } from 'eventemitter3'
import {
  ProviderInterface,
  ProviderInterfaceCallback,
  ProviderInterfaceEmitCb,
  ProviderInterfaceEmitted,
  ProviderStats,
} from '@polkadot/rpc-provider/types'

import { StorageValues } from './utils'
import { defaultLogger as logger } from './logger'

interface SubscriptionHandler {
  callback: ProviderInterfaceCallback
  type: string
}

interface Subscription extends SubscriptionHandler {
  method: string
  params: unknown[]
  onCancel: () => void
  result?: unknown
}

interface Handler {
  callback: ProviderInterfaceCallback
  method: string
  params: unknown[]
  start: number
  subscription?: SubscriptionHandler | undefined
}

export interface ChopsticksProviderProps {
  /** upstream endpoint */
  endpoint: string | undefined
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
  #worker: Worker
  #blockHash: string | undefined
  #dbPath: string | undefined
  #storageValues: StorageValues | undefined
  #handlers: Record<string, Handler> = {}

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
        logger.info('[Chopsticks provider] isReadyPromise: connected.')
        resolve()
      })
      this.#eventemitter.once('error', reject)
    })

    const chopsticksWorker = new Worker(new URL('./chopsticks-worker', import.meta.url), { type: 'module' })
    this.#worker = chopsticksWorker

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

    this.#worker!.onmessage = this.#onWorkerMessage

    this.#worker?.postMessage({
      type: 'connect',
      endpoint: this.#endpoint,
      blockHash: this.#blockHash,
      dbPath: this.#dbPath,
      storageValues: this.#storageValues,
    })
  }

  disconnect = async (): Promise<void> => {
    this.#worker?.postMessage({ type: 'disconnect' })
    this.#isConnected = false
    this.#eventemitter.emit('disconnected')
  }

  on = (type: ProviderInterfaceEmitted, sub: ProviderInterfaceEmitCb): (() => void) => {
    this.#eventemitter.on(type, sub)

    return (): void => {
      this.#eventemitter.removeListener(type, sub)
    }
  }

  send = async <T>(
    method: string,
    params: unknown[],
    _isCacheable?: boolean,
    subscription?: SubscriptionHandler,
  ): Promise<T> => {
    return new Promise<T>((resolve, reject): void => {
      try {
        if (!this.isConnected || this.#worker === undefined) {
          throw new Error('Api is not connected')
        }

        if (method !== 'system_health') {
          logger.info('[Chopsticks provider] send', { method, params })
        }

        const id = `${method}::${Date.now()}::${Math.random()}`

        const callback = (error?: Error | null, result?: T): void => {
          if (subscription) {
            // if it's a subscription, we usually returns the subid
            const subid = result as string
            if (subid) {
              if (this.#subscriptions[subid]?.result) {
                subscription.callback(null, this.#subscriptions[subid].result)
                return
              } else {
                this.#subscriptions[subid] = {
                  callback: subscription.callback,
                  method,
                  params,
                  type: subscription.type,
                  onCancel: (): void => {},
                }
              }
            }
          }

          error ? reject(error) : resolve(result as T)
        }

        this.#handlers[id] = {
          callback,
          method,
          params,
          start: Date.now(),
          subscription,
        }

        this.#worker?.postMessage({
          type: 'send',
          id,
          method,
          params,
        })
      } catch (error) {
        reject(error)
      }
    })
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

  #onWorkerMessage = (e: any) => {
    switch (e.data.type) {
      case 'connection':
        logger.info('[Chopsticks provider] connection.', e.data)
        if (e.data.connected) {
          this.#isConnected = true
          this.#eventemitter.emit('connected')
        } else {
          this.#isConnected = false
          this.#eventemitter.emit('error', new Error('Unable to connect to the chain'))
          logger.error(`Unable to connect to the chain: ${e.data.message}`)
        }
        break

      case 'subscribe-callback':
        {
          logger.info('[Chopsticks provider] subscribe-callback', e.data)
          const sub = this.#subscriptions[e.data.subid]
          if (!sub) {
            // record it first, sometimes callback comes first
            this.#subscriptions[e.data.subid] = {
              callback: () => {},
              method: e.data.method,
              params: e.data.params,
              type: e.data.type,
              onCancel: () => {},
              result: JSON.parse(e.data.result),
            }
            return
          }
          sub.callback(null, JSON.parse(e.data.result))
        }
        break

      case 'unsubscribe-callback':
        {
          logger.info('[Chopsticks provider] unsubscribe-callback', e.data)
          const sub = this.#subscriptions[e.data.subid]
          if (!sub) {
            logger.error(`Unable to find active subscription=${e.data.subid}`)
            return
          }
          sub.onCancel()
          delete this.#subscriptions[e.data.subid]
        }
        break

      case 'send-result':
        {
          const handler = this.#handlers[e.data.id]
          if (!handler) {
            logger.error(`Unable to find handler=${e.data.id}`)
            return
          }
          if (e.data.method !== 'system_health') {
            logger.info('[Chopsticks provider] send-result', {
              method: e.data.method,
              result: JSON.parse(e.data.result || '{}'),
              data: e.data,
            })
          }
          try {
            handler.callback(null, e.data.result ? JSON.parse(e.data.result) : undefined)
          } catch (error) {
            handler.callback(error as Error, undefined)
          }
          delete this.#handlers[e.data.id]
        }
        break

      default:
        break
    }
  }
}
