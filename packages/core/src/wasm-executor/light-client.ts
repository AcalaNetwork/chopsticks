import { HexString } from '@polkadot/util/types'
import { Response } from '@acala-network/chopsticks-executor'
import { WebSocket } from 'ws'
import { stringToU8a } from '@polkadot/util'

globalThis.WebSocket = typeof globalThis.WebSocket !== 'undefined' ? globalThis.WebSocket : (WebSocket as any)

import { ApiT } from '../api.js'

import { Deferred, defer } from '../utils/index.js'
import {
  connectionReset,
  getLatestBlock,
  getPeers,
  queryChain,
  startNetworkService,
  streamMessage,
  streamWritableBytes,
  timerFinished,
} from './index.js'
import { defaultLogger } from '../logger.js'

const logger = defaultLogger.child({ name: 'light-client' })

export class Connection {
  public destroyed = false
  #socket: globalThis.WebSocket

  #onOpen: (event: Event) => void = (event) => {
    if (this.onOpen && !this.destroyed) {
      this.onOpen(this.#socket, event)
    }
  }

  #onClose: (event: CloseEvent) => void = (event) => {
    if (this.onClose && !this.destroyed) {
      this.onClose(this.#socket, event)
    }
  }

  #onMessage: (event: MessageEvent) => void = (event) => {
    if (this.onMessage && !this.destroyed) {
      this.onMessage(this.#socket, new Uint8Array(event.data as ArrayBuffer))
    }
  }

  #onError: (event: Event) => void = (event) => {
    if (this.onError && !this.destroyed) {
      this.onError(this.#socket, event)
    }
  }

  public onOpen?: (ws: globalThis.WebSocket, event: Event) => void
  public onClose?: (ws: globalThis.WebSocket, event: CloseEvent) => void
  public onMessage?: (ws: globalThis.WebSocket, data: Uint8Array) => void
  public onError?: (ws: globalThis.WebSocket, event: Event) => void

  constructor(address: string) {
    this.#socket = new globalThis.WebSocket(address)
    this.#socket.binaryType = 'arraybuffer'
    this.#socket.addEventListener('error', this.#onError)
    this.#socket.addEventListener('open', this.#onOpen)
    this.#socket.addEventListener('close', this.#onClose)
    this.#socket.addEventListener('message', this.#onMessage)
  }

  send(data: Uint8Array) {
    this.#socket.send(data)
  }

  destroy() {
    this.destroyed = true
    if (this.#socket.readyState === 1) {
      this.#socket.close()
    }
  }
}

export type LightClientConfig = {
  genesisBlockHash: string
  bootnodes: string[]
}

export class LightClient {
  #requestId = 1
  // blacklist of addresses that we have failed to connect to
  #blacklist: string[] = []
  #connections: Map<number, Connection> = new Map()
  #queryResponse: Map<number, Deferred<Response>> = new Map()

  #chainId = defer<number>()

  constructor(
    config: LightClientConfig,
    readonly fallback: ApiT,
  ) {
    startNetworkService(config, this)
      .then((chainId) => {
        this.#chainId.resolve(chainId)
      })
      .catch((e) => {
        logger.error(e)
        this.#chainId.reject(e)
      })
  }

  get isReady() {
    return this.#chainId.promise.then(() => {})
  }

  connect(connId: number, address: string, _cert: Uint8Array) {
    if (this.#blacklist.includes(address)) {
      connectionReset(connId, new Uint8Array(0))
      return
    }

    const connection = new Connection(address)
    this.#connections.set(connId, connection)

    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this

    connection.onError = function (ws, error) {
      if (ws.readyState === 1 || ws.readyState === 0) return

      if (!error['code'] || ['EHOSTUNREACH', 'ECONNREFUSED', 'ETIMEDOUT'].includes(error['code'])) {
        self.#blacklist.push(address)
        logger.debug(`${error['message'] || ''} [blacklisted]`)
      }

      if (!connection.destroyed) {
        connection.destroyed = true
        self.#connections.delete(connId)
        connectionReset(connId, stringToU8a(error['message'] || ''))
      }
    }

    connection.onMessage = function (ws, data) {
      if (connection.destroyed) return
      if (ws.readyState != 1) return
      streamMessage(connId, 0, data)
    }

    connection.onClose = function (_ws, event) {
      if (!connection.destroyed) {
        connection.destroyed = true
        self.#connections.delete(connId)
        connectionReset(connId, stringToU8a(event.reason))
      }
    }

    connection.onOpen = function () {
      streamWritableBytes(connId, 0, 1024 * 1024)
    }
  }

  async queryResponse(requestId: number, response: Response) {
    this.#queryResponse.get(requestId)?.resolve(response)
    this.#queryResponse.delete(requestId)
  }

  streamSend(connectionId: number, data: Uint8Array) {
    const connection = this.#connections.get(connectionId)
    if (!connection) {
      this.resetConnection(connectionId)
    } else {
      connection.send(data)
    }
  }

  resetConnection(connectionId: number) {
    try {
      const connection = this.#connections.get(connectionId)
      if (connection && !connection.destroyed) {
        connection.destroy()
        this.#connections.delete(connectionId)
      }
    } catch (_e) {
      _e
    }
  }

  startTimer(ms: number) {
    ms = Number(ms)
    // In both NodeJS and browsers, if `setTimeout` is called with a value larger than
    // 2147483647, the delay is for some reason instead set to 1.
    // As mentioned in the documentation of `start_timer`, it is acceptable to end the
    // timer before the given number of milliseconds has passed.
    if (ms > 2147483647) ms = 2147483647
    // In browsers, `setTimeout` works as expected when `ms` equals 0. However, NodeJS
    // requires a minimum of 1 millisecond (if `0` is passed, it is automatically replaced
    // with `1`) and wants you to use `setImmediate` instead.
    if (ms == 0 && typeof setImmediate === 'function') {
      setImmediate(() => {
        try {
          timerFinished(this)
        } catch (_e) {
          _e
        }
      })
    } else {
      setTimeout(() => {
        try {
          timerFinished(this)
        } catch (_e) {
          _e
        }
      }, ms)
    }
  }

  async queryStorage(keys: HexString[], at: HexString) {
    const chainId = await this.#chainId.promise
    const requestId = this.#requestId++
    const deferred = defer<Response>()
    this.#queryResponse.set(requestId, deferred)
    await queryChain(
      chainId,
      requestId,
      {
        storage: {
          hash: at,
          keys,
        },
      },
      10,
      this,
    )
    const response = await deferred.promise
    if ('error' in response) {
      throw new Error(response.error)
    }
    if ('storage' in response) {
      return response.storage
    }
    throw new Error('Invalid response')
  }

  async queryBlock(block: HexString | number) {
    const chainId = await this.#chainId.promise
    const requestId = this.#requestId++
    const deferred = defer<Response>()
    this.#queryResponse.set(requestId, deferred)
    await queryChain(
      chainId,
      requestId,
      {
        block: {
          number: typeof block === 'number' ? block : null,
          hash: typeof block === 'string' ? block : null,
          header: true,
          body: true,
        },
      },
      10,
      this,
    )
    const response = await deferred.promise
    if ('error' in response) {
      throw new Error(response.error)
    }
    if ('block' in response) {
      return response.block
    }
    throw new Error('Invalid response')
  }

  // TODO: webrtc
  connectionStreamOpen(_connectionId: number) {}
  // TODO: webrtc
  connectionStreamReset(_connectionId: number, _streamId: number) {}

  async getPeers() {
    const chainId = await this.#chainId.promise
    return getPeers(chainId)
  }

  async getLatestBlock() {
    const chainId = await this.#chainId.promise
    return getLatestBlock(chainId)
  }
}
