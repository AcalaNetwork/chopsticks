import { HexString } from '@polkadot/util/types'
import { z } from 'zod'

import { Blockchain } from '../blockchain/index.js'
import { defaultLogger } from '../logger.js'

export const logger = defaultLogger.child({ name: 'rpc' })

export const zHex = z.custom<HexString>((val: any) => /^0x\w+$/.test(val))
export const zHash = z.string().length(66).and(zHex)

export class ResponseError extends Error {
  code: number

  constructor(code: number, message: string) {
    super(message)
    this.name = 'ResponseError'
    this.code = code
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
    }
  }
}

export interface Context {
  /**
   * The blockchain instance
   */
  chain: Blockchain
}

export interface SubscriptionManager {
  subscribe: (method: string, subid: string, onCancel?: () => void) => (data: any) => void
  unsubscribe: (subid: string) => void
}

export type Handler<TParams = any, TReturn = any> = (
  context: Context,
  params: TParams,
  subscriptionManager: SubscriptionManager,
) => Promise<TReturn>
export type Handlers = Record<string, Handler>
