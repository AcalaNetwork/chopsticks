import { AddressInfo, WebSocket, WebSocketServer } from 'ws'
import { ResponseError, SubscriptionManager } from '@acala-network/chopsticks-core'
import { z } from 'zod'
import http from 'node:http'

import { defaultLogger, truncate } from './logger.js'

const httpLogger = defaultLogger.child({ name: 'http' })
const wsLogger = defaultLogger.child({ name: 'ws' })

const singleRequest = z.object({
  id: z.number(),
  jsonrpc: z.literal('2.0'),
  method: z.string(),
  params: z.array(z.any()).default([]),
})

const batchRequest = z.array(singleRequest)

const requestSchema = z.union([singleRequest, batchRequest])

export type Handler = (
  data: { method: string; params: string[] },
  subscriptionManager: SubscriptionManager,
) => Promise<any>

const parseRequest = (request: string) => {
  try {
    return JSON.parse(request)
  } catch (e) {
    return undefined
  }
}

const readBody = (request: http.IncomingMessage) =>
  new Promise<string>((resolve) => {
    const bodyParts: any[] = []
    request
      .on('data', (chunk) => {
        bodyParts.push(chunk)
      })
      .on('end', () => {
        resolve(Buffer.concat(bodyParts).toString())
      })
  })

const respond = (res: http.ServerResponse, data?: any) => {
  res.writeHead(200, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST',
    'Access-Control-Allow-Headers': '*',
    'Content-Type': 'application/json',
  })
  if (data) {
    res.write(data)
  }
  res.end()
}

export const createServer = async (handler: Handler, port: number) => {
  let wss: WebSocketServer | undefined
  let listenPort: number | undefined

  const emptySubscriptionManager = {
    subscribe: () => {
      throw new Error('Subscription is not supported')
    },
    unsubscribe: () => {
      throw new Error('Subscription is not supported')
    },
  }

  const server = http.createServer(async (req, res) => {
    if (req.method === 'OPTIONS') {
      return respond(res)
    }

    try {
      if (req.method !== 'POST') {
        throw new Error('Only POST method is supported')
      }
      const body = await readBody(req)
      const parsed = await requestSchema.safeParseAsync(parseRequest(body))

      if (!parsed.success) {
        httpLogger.error('Invalid request: %s', body)
        throw new Error('Invalid request: ' + body)
      }

      httpLogger.trace({ req: parsed.data }, 'Received request')

      let response: any
      if (Array.isArray(parsed.data)) {
        response = await Promise.all(
          parsed.data.map((req) => {
            const result = handler(req, emptySubscriptionManager)
            return { id: req.id, jsonrpc: '2.0', result }
          }),
        )
      } else {
        const result = await handler(parsed.data, emptySubscriptionManager)
        response = { id: parsed.data.id, jsonrpc: '2.0', result }
      }

      respond(res, JSON.stringify(response))
    } catch (err: any) {
      respond(
        res,
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          error: {
            message: err.message,
          },
        }),
      )
    }
  })

  for (let i = 0; i < 10; i++) {
    const preferPort = port ? port + i : undefined
    wsLogger.debug('Try starting on port %d', preferPort)
    const success = await new Promise<boolean>((resolve) => {
      server.once('error', (e: any) => {
        if (e.code === 'EADDRINUSE') {
          server.close()
          resolve(false)
        }
      })
      server.listen(preferPort, () => {
        wss = new WebSocketServer({ server, maxPayload: 1024 * 1024 * 100 })
        listenPort = (server.address() as AddressInfo).port
        resolve(true)
      })
    })
    if (success) {
      break
    }
  }

  if (!wss || !listenPort) {
    throw new Error(`Failed to create WebsocketServer at port ${port}`)
  }

  wss.on('connection', (ws) => {
    wsLogger.debug('New connection')

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
            wsLogger.trace({ method, subid, data: truncate(data) }, 'Subscription notification')
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

    const processRequest = async (req: Zod.infer<typeof singleRequest>) => {
      wsLogger.trace(
        {
          id: req.id,
          method: req.method,
        },
        'Received message',
      )

      try {
        const resp = await handler(req, subscriptionManager)
        wsLogger.trace(
          {
            id: req.id,
            method: req.method,
            result: truncate(resp),
          },
          'Response for request',
        )
        return {
          id: req.id,
          jsonrpc: '2.0',
          result: resp ?? null,
        }
      } catch (e) {
        wsLogger.info('Error handling request: %o', (e as Error).stack)
        return {
          id: req.id,
          jsonrpc: '2.0',
          error: e instanceof ResponseError ? e : { code: -32603, message: `Internal ${e}` },
        }
      }
    }

    ws.on('close', () => {
      wsLogger.debug('Connection closed')
      for (const [subid, onCancel] of Object.entries(subscriptions)) {
        onCancel(subid)
      }
      ws.removeAllListeners()
    })
    ws.on('error', () => {
      wsLogger.debug('Connection error')
      for (const [subid, onCancel] of Object.entries(subscriptions)) {
        onCancel(subid)
      }
      ws.removeAllListeners()
    })

    ws.on('message', async (message) => {
      const parsed = await requestSchema.safeParseAsync(parseRequest(message.toString()))
      if (!parsed.success) {
        wsLogger.error('Invalid request: %s', message)
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

      const { data: req } = parsed
      if (Array.isArray(req)) {
        wsLogger.trace({ req }, 'Received batch request')
        const resp = await Promise.all(req.map(processRequest))
        send(resp)
      } else {
        wsLogger.trace({ req }, 'Received single request')
        const resp = await processRequest(req)
        send(resp)
      }
    })
  })

  return {
    port: listenPort,
    close: async () => {
      server.close()
      server.closeAllConnections()
      server.unref()
    },
  }
}
