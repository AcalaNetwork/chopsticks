import { HexString } from '@polkadot/util/types'
import { compactHex, decodeKey, pinoLogger } from '@acala-network/chopsticks-core'

import { Context, PREFIX_LENGTH, ResponseError, SubscriptionManager } from '../../index.js'
import { createServer } from '../../server.js'

export const setupServer = async (context: Context, trace: any) => {
  const runtimeVersion = await context.chain.head.runtimeVersion
  const endpoint = runtimeVersion.specName.includes('acala')
    ? 'https://eth-rpc-acala.aca-api.network'
    : 'https://eth-rpc-karura.aca-api.network'

  const getHandler = async (method: string) => {
    switch (method) {
      case 'debug_traceTransaction': {
        return async (_context: Context, _params: any[], _subscriptionManager: SubscriptionManager) => {
          return trace
        }
      }
      case 'debug_storageRangeAt': {
        return async (context: Context, params: any[], _subscriptionManager: SubscriptionManager) => {
          const [txBlockHash, _txIndex, address, start, maxSize] = params
          const storage = {}

          const block = await context.chain.getBlock(txBlockHash)
          if (!block) {
            throw new Error(`Block not found ${txBlockHash}`)
          }
          const meta = await block.meta
          const startKey = compactHex(meta.query.evm.accountStorages(address, start))
          const keys = await block.getKeysPaged({
            prefix: startKey.slice(PREFIX_LENGTH),
            pageSize: maxSize,
            startKey: startKey,
          })

          const requestedKeys = [startKey, ...keys.slice(maxSize - 1)] as HexString[]

          const storages = await Promise.all(
            requestedKeys.map(async (key) => {
              const value = (await block.get(key)) || null
              const { decodedKey } = decodeKey(meta, key as any)
              return [decodedKey!.args[1].toHex(), value] as [HexString, HexString | null]
            }),
          )

          for (const [key, value] of storages) {
            storage[key] = value
          }

          let nextKey = keys[maxSize - 1] || null
          if (nextKey) {
            const { decodedKey } = decodeKey(meta, nextKey as any)
            nextKey = decodedKey?.args[1].toHex() || null
          }

          return {
            storage,
            nextKey,
          }
        }
      }
      // everything else if forwarded to eth rpc endpoint
      case 'net_version':
      case 'eth_chainId':
      case 'eth_getCode':
      case 'eth_accounts':
      case 'eth_getBlockByNumber':
      case 'eth_getBlockByHash':
      case 'eth_getTransactionByHash':
      case 'eth_getTransactionReceipt': {
        return async (_context: Context, params: any[], _subscriptionManager: SubscriptionManager) => {
          return fetch(endpoint, {
            headers: [
              ['Access-Control-Allow-Origin', '*'],
              ['Content-Type', 'application/json'],
              ['Accept', 'application/json'],
            ],
            method: 'POST',
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
          })
            .then((res) => res.json())
            .then(({ result, error }) => {
              if (error) {
                throw new ResponseError(error.code, error.message)
              }
              return result
            })
        }
      }
      default: {
        throw new Error('not implemented')
      }
    }
  }

  const handler =
    (context: Context) =>
    async ({ method, params }: { method: string; params: any[] }, subscriptionManager: SubscriptionManager) => {
      const handler = await getHandler(method)
      if (!handler) {
        throw new ResponseError(-32601, `Method not found: ${method}`)
      }
      return handler(context, params, subscriptionManager)
    }

  const { close, port: listenPort } = await createServer(handler(context), 8545)

  pinoLogger.info(`RPC listening on port ${listenPort}`)

  process.once('SIGINT', async () => {
    await close()
    process.exit(0)
  })
}
