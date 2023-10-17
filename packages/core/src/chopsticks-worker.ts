import { Blockchain } from './blockchain'
import { allHandlers } from './rpc'
import { defaultLogger as logger } from './logger'
import { setStorage } from './utils'
import { setup } from './setup'

let chain: Blockchain | undefined

const subscriptions = {}

const providerHandlers = {
  ...allHandlers,
  new_block: async (context: any, _params: any, _subscriptionManager: any) => {
    const { chain } = context
    const block = await chain.newBlock()
    return block
  },
}

const subscriptionManager = {
  subscribe: (method: string, subid: string, onCancel: () => void = () => {}) => {
    subscriptions[subid] = onCancel
    return (data: any) => {
      postMessage({
        type: 'subscribe-callback',
        method,
        subid,
        result: JSON.stringify(data),
      })
    }
  },
  unsubscribe: (subid: string) => {
    if (subscriptions[subid]) {
      subscriptions[subid](subid) // call onCancel
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
      try {
        logger.info('[Chopsticks worker] onMessage: connect. Initializing...')
        chain = await setup({
          endpoint: e.data.endpoint,
          mockSignatureHost: true,
          db: e.data.dbPath,
          block: e.data.blockHash,
        })
        logger.info('[Chopsticks worker] onMessage: connect. Chain setup done.')
        await setStorage(chain, e.data.storageValues)
        logger.info('[Chopsticks worker] onMessage: connect. Set storage done.')
        postMessage({
          type: 'connection',
          connected: true,
        })
      } catch (e) {
        logger.error('[Chopsticks worker] onMessage: connect error.', e)
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
      {
        const { method, params } = e.data
        const handler = providerHandlers[method]
        if (!handler) {
          logger.error(`Unable to find rpc handler=${method}`)
          return Promise.reject(new Error(`Unable to find handler=${method}`))
        }
        const result = await handler({ chain: chain! }, params, subscriptionManager)
        postMessage({
          type: 'send-result',
          id: e.data.id,
          method: method,
          result: JSON.stringify(result),
        })
      }
      break

    default:
      break
  }
}
