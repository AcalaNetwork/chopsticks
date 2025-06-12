import type {
  ProviderInterface,
  ProviderInterfaceCallback,
  ProviderInterfaceEmitCb,
  ProviderInterfaceEmitted,
} from '@polkadot/rpc-provider/types'
import { EventEmitter } from 'eventemitter3'
import { JsonRpcRequest } from '@polkadot/rpc-provider/types';
import { JsonRpcProvider } from '@polkadot-api/json-rpc-provider';

import type { Blockchain } from './blockchain/index.js'
import type { Database } from './database.js'
import { defaultLogger } from './logger.js'
import { type Handlers, allHandlers } from './rpc/index.js'
import { setup } from './setup.js'

const providerHandlers: Handlers = {
  ...allHandlers,
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
  #eventemitter = new EventEmitter()
  #isReadyPromise: Promise<void>
  #subscriptions: Record<string, Subscription> = {}

  constructor(public readonly chain: Blockchain) {
    this.#isReadyPromise = new Promise((resolve, reject): void => {
      this.#eventemitter.once('connected', resolve)
      this.#eventemitter.once('error', reject)
      this.connect()
    })
  }

  static fromEndpoint = async (endpoint: string, block?: number | string | null, db?: Database) => {
    return new ChopsticksProvider(
      await setup({
        endpoint,
        mockSignatureHost: true,
        block,
        db,
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
        if (sub) {
          sub.callback(null, data)
        } else {
          logger.trace(`Unable to find active subscription=${subid}`)
        }
      }
    },
    unsubscribe: (subid: string) => {
      logger.debug('unsubscribe-callback', subid)
      const sub = this.#subscriptions[subid]
      if (sub) {
        sub.onCancel?.()
        delete this.#subscriptions[subid]
      } else {
        logger.trace(`Unable to find active subscription=${subid}`)
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

      if (subscription) {
        logger.debug('subscribe', { method, params })
        const subid = await rpcHandler({ chain: this.chain }, params, this.subscriptionManager)
        if (!subid) {
          throw new Error(`Unable to subscribe=${method}`)
        }

        this.#subscriptions[subid] = {
          callback: subscription.callback,
          method,
          params,
          type: subscription.type,
        }

        return subid
      }
      logger.debug('call', { method, params })
      return rpcHandler({ chain: this.chain }, params, this.subscriptionManager)
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
      logger.trace(`Unable to find active subscription=${id}`)
      return false
    }

    try {
      return this.send<boolean>(method, [id])
    } catch {
      return false
    }
  }
}


// A convenient Polkadot-API JSON-RPC provider.
export function getPapiChopsticksProvider(chopsticksProvider: ChopsticksProvider): JsonRpcProvider {
  return (onMessage: (message: string) => void) => {
    const processResponse: (id: string | number) => ProviderInterfaceCallback = (id) => (error, result) => {
      const response = {
        jsonrpc: "2.0",
        id,
        error: undefined as any,
        result: undefined as any,
      };
      if (error) {
        response.error = {
          message: error.message,
        };
        // Not sure if this is compliant, but still we'll do it.
        response.result = {
          success: false,
          error: response.error,
        };
      } else {
        response.result = result;
      }

      onMessage(JSON.stringify(response));
    };

    return {
      send(message) {
        const rpcRequest: JsonRpcRequest = JSON.parse(message);
        const callback = processResponse(rpcRequest.id);
        const handlerFn = providerHandlers[rpcRequest.method];

        switch (handlerFn.length) {
          case 2: {
            // Not expecting subscription
            return chopsticksProvider
              .send(rpcRequest.method, rpcRequest.params)
              .then((response) => callback(null, response))
              .catch((error) => callback(error, null));
          }
          case 3:
            return chopsticksProvider.send(rpcRequest.method, rpcRequest.params, false, {
              callback,
              type: rpcRequest.method,
            });
        }
      },
      async disconnect() {
        chopsticksProvider.disconnect();
        await chopsticksProvider.chain.close();
      },
    };
  };
}

