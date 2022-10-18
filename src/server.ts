import WebSocket, { AddressInfo } from 'ws'

import { defaultLogger } from './logger'

const logger = defaultLogger.child({ name: 'ws' })

export type Handler = (data: { method: string; params: string[] }) => Promise<any>

const parseRequest = (request: string) => {
  try {
    return JSON.parse(request)
  } catch (e) {
    return undefined
  }
}

export const createServer = (port: number, handler: Handler) => {
  logger.debug('Starting on port %d', port)
  const wss = new WebSocket.Server({ port, maxPayload: 1024 * 1024 * 100 })

  const promise = new Promise<number>((resolve, reject) => {
    wss.on('listening', () => {
      logger.debug(wss.address(), 'Listening')
      resolve((wss.address() as AddressInfo).port)
    })

    wss.on('error', (err) => {
      logger.error(err, 'Error')
      reject(err)
    })
  })

  wss.on('connection', (ws) => {
    logger.debug('New connection')

    const send = (data: object) => {
      ws.send(JSON.stringify(data))
    }

    ws.on('close', () => {
      logger.debug('Connection closed')
      ws.removeAllListeners()
    })
    ws.on('error', () => {
      logger.debug('Connection error')
      ws.removeAllListeners()
    })

    ws.on('message', async (message) => {
      logger.debug('Received message: %s', message)

      const req = parseRequest(message.toString())
      if (!req || !Object.hasOwn(req, 'id') || !req.method) {
        logger.debug('Invalid request: %s', message)
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

      try {
        const resp = await handler(req)
        logger.debug('Sending response for request %o %o', req.id, req.method)
        send({
          id: req.id,
          jsonrpc: '2.0',
          result: resp || null,
        })
      } catch (e) {
        logger.debug('Error handling request: %o %s', e, e)
        send({
          id: req.id,
          jsonrpc: '2.0',
          error: e,
        })
      }
    })
  })

  return promise
}
