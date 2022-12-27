import WebSocket, { AddressInfo, WebSocketServer } from 'ws'

import { SubscriptionManager } from './rpc/shared'
import { defaultLogger } from './logger'

const logger = defaultLogger.child({ name: 'ws' })

export type Handler = (
  data: { method: string; params: string[] },
  subscriptionManager: SubscriptionManager
) => Promise<any>

const parseRequest = (request: string) => {
  try {
    return JSON.parse(request)
  } catch (e) {
    return undefined
  }
}

const createWS = async (port: number) => {
  const wss = new WebSocketServer({ port, maxPayload: 1024 * 1024 * 100 })

  const promise = new Promise<[WebSocketServer?, number?]>((resolve) => {
    wss.on('listening', () => {
      resolve([wss, (wss.address() as AddressInfo).port])
    })

    wss.on('error', (_) => {
      resolve([])
    })
  })

  return promise
}

export const createServer = async (handler: Handler, port?: number) => {
  let wss: WebSocketServer | undefined
  let listenPort: number | undefined
  for (let i = 0; i < 5; i++) {
    const preferPort = (port || 0) + i
    logger.debug('Try starting on port %d', preferPort)
    const [maybeWss, maybeListenPort] = await createWS(preferPort)
    if (maybeWss && maybeListenPort) {
      wss = maybeWss
      listenPort = maybeListenPort
      break
    }
  }

  if (!wss || !listenPort) {
    throw new Error(`Failed to create WebsocketServer at port ${port}`)
  }

  wss.on('connection', (ws) => {
    logger.debug('New connection')

    const send = (data: object) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(data))
      }
    }

    const subscriptions: Record<string, (subid: string) => void> = {}
    const subscriptionManager = {
      subscribe: (method: string, subid: string, onCancel: () => void = () => {}) => {
        subscriptions[subid] = onCancel
        return (data: object) => {
          if (subscriptions[subid]) {
            send({
              jsonrpc: '2.0',
              method,
              params: {
                result: data,
                subscription: subid,
              },
            })
          }
        }
      },
      unsubscribe: (subid: string) => {
        if (subscriptions[subid]) {
          subscriptions[subid](subid)
          delete subscriptions[subid]
        }
      },
    }

    ws.on('close', () => {
      logger.debug('Connection closed')
      for (const [subid, onCancel] of Object.entries(subscriptions)) {
        onCancel(subid)
      }
      ws.removeAllListeners()
    })
    ws.on('error', () => {
      logger.debug('Connection error')
      for (const [subid, onCancel] of Object.entries(subscriptions)) {
        onCancel(subid)
      }
      ws.removeAllListeners()
    })

    ws.on('message', async (message) => {
      const req = parseRequest(message.toString())
      if (!req || req.id == null || req.method == null) {
        logger.info('Invalid request: %s', message)
        send({
          id: null,
          jsonrpc: '2.0',
          error: {
            code: -32600,
            message: 'Invalid JSON Request',
          },
        })
        return
      }

      logger.trace(
        {
          id: req.id,
          method: req.method,
        },
        'Received message'
      )

      try {
        const resp = await handler(req, subscriptionManager)
        logger.trace('Sending response for request %o %o', req.id, req.method)
        send({
          id: req.id,
          jsonrpc: '2.0',
          result: resp || null,
        })
      } catch (e) {
        logger.info('Error handling request: %s %o', e, (e as Error).stack)
        send({
          id: req.id,
          jsonrpc: '2.0',
          error: e,
        })
      }
    })
  })

  return {
    port: listenPort,
    close: () =>
      new Promise<void>((resolve, reject) => {
        wss?.clients.forEach((socket) => socket.close())
        wss?.close((err) => {
          if (err) {
            reject(err)
          } else {
            resolve()
          }
        })
      }),
  }
}
