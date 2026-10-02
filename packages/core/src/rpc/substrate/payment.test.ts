import { TypeRegistry } from '@polkadot/types'
import { u8aToHex } from '@polkadot/util'
import type { HexString } from '@polkadot/util/types'
import { describe, expect, it } from 'vitest'

import type { Context, SubscriptionManager } from '../shared.js'
import { payment_queryFeeDetails, payment_queryInfo } from './payment.js'

// `system.remark(0x01)`, signed (v4) by //Alice, nonce 0, immortal, for Polkadot Asset Hub (spec 2005000): 110 bytes.
const SIGNED =
  '0xb1018400d43593c715fdd31c61141abd04a99fd6822c8558854ccde39a5684e7a56da27d010e7b4fe5fc4a7f6d7b94c01c7141b5653119e495246349919286d2b7ee46f671d4b1a86403bdc5f690fc12c556c5bd1547d18c424e60bcd55744bc9a893acd8b000000000000000401'
// `system.remark(0x01)`, nonce 0, signed by //Alice through VerifyMultiSignature for Paseo People Next (spec 3000000).
const GENERAL =
  '0xd90145000100e20c04de718dceef47d7490ec926db3766e20177b9cac73aa75554ee1103e31b252f1191d9dcd325e87313e639b4d34eb6c0cdf619bd69fd27e498e7ee634c0188dc3417d5058ec4b4503e0c12ea1a0a89be200fe98922423d4334014fa6b0ee000000000000000000000000000000000401'
const HASH = `0x${'11'.repeat(32)}` as HexString

const registry = new TypeRegistry()

describe.each([
  ['payment_queryInfo', payment_queryInfo, 'TransactionPaymentApi_query_info'],
  ['payment_queryFeeDetails', payment_queryFeeDetails, 'TransactionPaymentApi_query_fee_details'],
])('%s', (_, handler, method) => {
  const run = async (extrinsic: HexString, createType: (type: string, value: Uint8Array) => unknown) => {
    const calls: [string, HexString[]][] = []
    const block = {
      registry: Promise.resolve({ createType }),
      call: async (method: string, args: HexString[]) => {
        calls.push([method, args])
        return { result: '0x01' }
      },
    }
    const context = { chain: { getBlock: async () => block } } as unknown as Context
    expect(await handler(context, [extrinsic, HASH], {} as SubscriptionManager)).toBe('0x01')
    return calls
  }

  it('passes the extrinsic length SCALE-encoded', async () => {
    // decoding an extrinsic needs the chain's metadata; re-encoding a valid one gives its bytes back
    const calls = await run(SIGNED, (type, value) =>
      type === 'Extrinsic' ? { toHex: () => u8aToHex(value) } : registry.createType(type, value),
    )
    // the runtime decodes the length as a SCALE `u32`, little-endian: 110 is 0x6e000000, not 0x0000006e
    expect(calls).toEqual([[method, [SIGNED, '0x6e000000']]])
  })

  it('passes a general extrinsic to the runtime without decoding it', async () => {
    // polkadot.js on People Next: a general extrinsic does not decode
    const calls = await run(GENERAL, (type, value) => {
      if (type === 'Extrinsic') throw new Error('createType(Extrinsic):: decodeU8aStruct: failed')
      return registry.createType(type, value)
    })
    // 120 bytes
    expect(calls).toEqual([[method, [GENERAL, '0x78000000']]])
  })
})
