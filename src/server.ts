import WebSocket from 'ws'

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
  const wss = new WebSocket.Server({ port })
  wss.on('listening', () => {
    logger.debug('Listening on port %d', port)
  })

  wss.on('connection', (ws) => {
    logger.debug('New connection')

    const send = (data: object) => {
      logger.debug('Sending %o', data)

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
      if (!req || !req.id || !req.method) {
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
        send({
          id: req.id,
          jsonrpc: '2.0',
          result: resp,
        })
      } catch (e) {
        logger.debug('Error handling request: %o', e)
        send({
          id: req.id,
          jsonrpc: '2.0',
          error: e,
        })
      }
    })
  })
}
