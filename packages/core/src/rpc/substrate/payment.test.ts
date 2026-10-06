import { TypeRegistry } from '@polkadot/types'
import type { HexString } from '@polkadot/util/types'
import { describe, expect, it } from 'vitest'

import type { Context, SubscriptionManager } from '../shared.js'
import { payment_queryFeeDetails, payment_queryInfo } from './payment.js'

// `system.remark(0x01)`, nonce 0, signed by //Alice through VerifyMultiSignature for Paseo People Next (spec 3000000).
const GENERAL =
  '0xd90145000100e20c04de718dceef47d7490ec926db3766e20177b9cac73aa75554ee1103e31b252f1191d9dcd325e87313e639b4d34eb6c0cdf619bd69fd27e498e7ee634c0188dc3417d5058ec4b4503e0c12ea1a0a89be200fe98922423d4334014fa6b0ee000000000000000000000000000000000401'
const HASH = `0x${'11'.repeat(32)}` as HexString

const registry = new TypeRegistry()

describe.each([
  ['payment_queryInfo', payment_queryInfo, 'TransactionPaymentApi_query_info'],
  ['payment_queryFeeDetails', payment_queryFeeDetails, 'TransactionPaymentApi_query_fee_details'],
])('%s', (_, handler, method) => {
  it('passes a general extrinsic to the runtime without decoding it', async () => {
    const calls: [string, HexString[]][] = []
    const block = {
      // polkadot.js on People Next: a general extrinsic does not decode
      registry: Promise.resolve({
        createType: (type: string, value: unknown) => {
          if (type === 'Extrinsic') throw new Error('createType(Extrinsic):: decodeU8aStruct: failed')
          return registry.createType(type, value)
        },
      }),
      call: async (method: string, args: HexString[]) => {
        calls.push([method, args])
        return { result: '0x01' }
      },
    }
    const context = { chain: { getBlock: async () => block } } as unknown as Context
    expect(await handler(context, [GENERAL, HASH], {} as SubscriptionManager)).toBe('0x01')
    expect(calls.map(([method, [extrinsic]]) => [method, extrinsic])).toEqual([[method, GENERAL]])
  })
})
