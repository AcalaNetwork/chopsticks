/* eslint-disable no-case-declarations */
import { Blockchain } from './blockchain'
import { allHandlers } from './rpc'
import { defaultLogger } from './logger'
import { setStorage } from './utils'
import { setup } from './setup'

let chain: Blockchain | undefined

const subscriptions = {}

const subscriptionManager = {
  subscribe: (method: string, subid: string) => {
    return (data: any) => {
      if (subscriptions[subid]) {
        defaultLogger.trace({ method, subid, data: data }, 'Subscription')
        self.postMessage({
          type: 'subscribe-callback',
          subid,
          data,
        })
      }
    }
  },
  unsubscribe: (subid: string) => {
    if (subscriptions[subid]) {
      delete subscriptions[subid]
      postMessage({
        type: 'unsubscribe-callback',
        subid,
      })
    }
  },
}

onmessage = async (e) => {
  switch (e.data.type) {
    case 'connect':
      // FIXME: WARNING in /node_modules/typeorm/browser/driver/react-native/ReactNativeDriver.js
      // see: https://github.com/typeorm/typeorm/issues/2158
      // this repo may not have this problem since using vite, but polkadot.js app will have
      try {
        defaultLogger.info('[Chopsticks worker] onMessage: connect. Initializing...')
        chain = await setup({
          endpoint: e.data.endpoint,
          mockSignatureHost: true,
          db: e.data.dbPath,
          block: e.data.blockHash,
        })
        defaultLogger.info('[Chopsticks worker] onMessage: connect. Chain setup done.')
        setStorage(chain, {
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
        defaultLogger.info('[Chopsticks worker] onMessage: connect. Set storage done.')
        postMessage({
          type: 'connection',
          connected: true,
        })
      } catch (e) {
        defaultLogger.error('[Chopsticks worker] onMessage: connect error.', e)
        postMessage({
          type: 'connection',
          connected: false,
          message: e,
        })
      }
      break

    case 'disconnect':
      if (chain) {
        await chain?.api?.disconnect()
        await chain?.close()
      }
      break

    case 'send':
      const { method, params, subid } = e.data
      if (subid) {
        subscriptions[subid] = {
          method,
          params,
        }
      }
      const handler = allHandlers[method]
      if (!handler) {
        defaultLogger.error(`Unable to find handler=${method}`)
        return Promise.reject(new Error(`Unable to find handler=${method}`))
      }
      const result = await handler({ chain: chain! }, params, subscriptionManager)
      postMessage({
        type: 'send-result',
        id: e.data.id,
        result: JSON.stringify(result),
      })
      break

    default:
      break
  }
}
