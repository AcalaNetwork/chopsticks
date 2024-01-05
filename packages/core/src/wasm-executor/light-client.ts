import { BlockRequest, BlocksResponse, StorageRequest, StorageResponse } from '@acala-network/chopsticks-executor'
import { HexString } from '@polkadot/util/types'
import { WebSocket } from 'ws'
import { stringToU8a } from '@polkadot/util'

globalThis.WebSocket = typeof globalThis.WebSocket !== 'undefined' ? globalThis.WebSocket : (WebSocket as any)

import { Deferred, defer } from '../utils/index.js'
import {
  blocksRequest,
  connectionReset,
  getPeers,
  startNetworkService,
  storageRequest,
  streamMessage,
  streamWritableBytes,
  timerFinished,
} from './index.js'
import { defaultLogger } from '../logger.js'

const logger = defaultLogger.child({ name: 'light-client' })

export class Connection {
  public destroyed = false
  public socket: globalThis.WebSocket

  constructor(address: string) {
    this.socket = new globalThis.WebSocket(address)
    this.socket.binaryType = 'arraybuffer'
  }

  send(data: Uint8Array) {
    this.socket.send(data)
  }

  destroy() {
    this.destroyed = true
    if (this.socket.readyState === 1) {
      this.socket.close()
    }
    this.socket.onopen = null
    this.socket.onclose = null
    this.socket.onmessage = null
    this.socket.onerror = null
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
  #connections: Record<number, Connection> = {}
  #storageResponse: Map<number, Deferred<StorageResponse>> = new Map()
  #blockResponse: Map<number, Deferred<BlocksResponse>> = new Map()

  #chainId = defer<number>()

  get isReady() {
    return this.#chainId.promise.then(() => {})
  }

  constructor(config: LightClientConfig) {
    startNetworkService(config, this)
      .then((chainId) => {
        this.#chainId.resolve(chainId)
      })
      .catch((e) => {
        logger.error(e)
        this.#chainId.reject(e)
      })
  }

  static async create(config: LightClientConfig) {
    const client = new LightClient(config)
    await client.isReady
    return client
  }

  connect(connectionId: number, address: string, _cert: Uint8Array) {
    const blacklist = this.#blacklist
    const connections = this.#connections
    if (blacklist.includes(address)) {
      connectionReset(connectionId, new Uint8Array(0))
      return
    }

    const connection = new Connection(address)
    connections[connectionId] = connection

    connection.socket.addEventListener('error', function (error) {
      if (this.readyState === 1 || this.readyState === 0) return

      if (['EHOSTUNREACH', 'ECONNREFUSED', 'ETIMEDOUT'].includes(error['code'])) {
        blacklist.push(address)
        logger.debug(`${error['message'] || ''} [blacklisted]`)
      }

      const connection = connections[connectionId]
      if (connection && !connection.destroyed) {
        connection.destroyed = true
        delete connections[connectionId]
        connectionReset(connectionId, stringToU8a(error['message'] || ''))
      }
    })

    connection.socket.addEventListener('message', function (event) {
      const connection = connections[connectionId]
      if (!connection || connection.destroyed) return
      if (connection.socket.readyState != 1) return
      streamMessage(connectionId, 0, new Uint8Array(event.data as ArrayBuffer))
    })

    connection.socket.addEventListener('close', function (event) {
      const connection = connections[connectionId]
      if (connection && !connection.destroyed) {
        connection.destroyed = true
        delete connections[connectionId]
        connectionReset(connectionId, stringToU8a(event.reason))
      }
    })

    connection.socket.addEventListener('open', function () {
      streamWritableBytes(connectionId, 0, 1024 * 1024)
    })
  }

  async storageResponse(response: StorageResponse) {
    this.#storageResponse.get(response.id)?.resolve(response)
    this.#storageResponse.delete(response.id)
  }

  async blockResponse(response: BlocksResponse) {
    this.#blockResponse.get(response.id)?.resolve(response)
    this.#blockResponse.delete(response.id)
  }

  streamSend(connectionId: number, data: Uint8Array) {
    const connection = this.#connections[connectionId]
    if (!connection) {
      this.resetConnection(connectionId)
    } else {
      connection.send(data)
    }
  }

  resetConnection(connectionId: number) {
    try {
      const connection = this.#connections[connectionId]
      if (connection && !connection.destroyed) {
        connection.destroy()
        delete this.#connections[connectionId]
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

  async queryStorage(blockHash: HexString, keys: HexString[]) {
    const chainId = await this.#chainId.promise
    const id = this.#requestId++
    const deferred = defer<StorageResponse>()
    this.#storageResponse.set(id, deferred)
    await storageRequest(chainId, { id, blockHash, keys, retries: 10 } satisfies StorageRequest, this)
    const response = await deferred.promise
    if (response.errorReason) {
      throw new Error(response.errorReason)
    }
    return response.items
  }

  async queryBlock(block: HexString | number) {
    const chainId = await this.#chainId.promise
    const id = this.#requestId++
    const deferred = defer<BlocksResponse>()
    this.#blockResponse.set(id, deferred)
    await blocksRequest(
      chainId,
      {
        id,
        blockNumber: typeof block === 'number' ? block : null,
        blockHash: typeof block === 'string' ? block : null,
        retries: 10,
      } satisfies BlockRequest,
      this,
    )
    const response = await deferred.promise
    if (response.errorReason) {
      throw new Error(response.errorReason)
    }
    return response
  }

  connectionStreamOpen(_connectionId: number) {}
  connectionStreamReset(_connectionId: number, _streamId: number) {}

  async getPeers() {
    const chainId = await this.#chainId.promise
    return getPeers(chainId)
  }
}
