import { TypeRegistry } from '@polkadot/types'
import type { TransactionValidity } from '@polkadot/types/interfaces'
import type { HexString } from '@polkadot/util/types'
import { describe, expect, it } from 'vitest'

import type { Context, SubscriptionManager } from '../rpc/shared.js'
import { system_accountNextIndex } from '../rpc/substrate/system.js'
import type { Blockchain } from './index.js'
import { BuildBlockMode, TxPool } from './txpool.js'

// Two general (v5) extrinsics, `system.remark(0x01)` with nonce 0 and nonce 1, signed by //Alice (ed25519) through
// VerifyMultiSignature for the Paseo People Next runtime (spec 3000000), and that runtime's
// TaggedTransactionQueue_validate_transaction result for each.
const GENERAL_0 =
  '0xd90145000100e20c04de718dceef47d7490ec926db3766e20177b9cac73aa75554ee1103e31b252f1191d9dcd325e87313e639b4d34eb6c0cdf619bd69fd27e498e7ee634c0188dc3417d5058ec4b4503e0c12ea1a0a89be200fe98922423d4334014fa6b0ee000000000000000000000000000000000401'
const GENERAL_1 =
  '0xd901450001007819299ad4d56d0f2d958b559fddb92065872b2091de8297ef2bfc9c0b9bf2e8001184dd52524c88b1a34873287a07bb2e1d6b5716d634580541b45408951f0b88dc3417d5058ec4b4503e0c12ea1a0a89be200fe98922423d4334014fa6b0ee000000000000000000000004000000000401'
const VALIDITY_0 =
  '0x00b20200000000000000049088dc3417d5058ec4b4503e0c12ea1a0a89be200fe98922423d4334014fa6b0ee00000000feffffffffffffff01'
const VALIDITY_1 =
  '0x00b202000000000000049088dc3417d5058ec4b4503e0c12ea1a0a89be200fe98922423d4334014fa6b0ee00000000049088dc3417d5058ec4b4503e0c12ea1a0a89be200fe98922423d4334014fa6b0ee01000000feffffffffffffff01'
const ALICE = '5FA9nQDVg267DEd8m1ZypXLBnvN7SFxYwV7ndqSYGiN9TTpu'
const ALICE_TAG = '0x88dc3417d5058ec4b4503e0c12ea1a0a89be200fe98922423d4334014fa6b0ee00000000'
const BOB_TAG = '0xd17c2d7823ebf260fd138f2d7e27d114c0145d968b5ff5006125f2414fadae6900000000'
const SIGNED = '0x0884'

const registry = new TypeRegistry()

const valid = (provides: HexString[]) =>
  registry
    .createType<TransactionValidity>('TransactionValidity', {
      ok: { priority: 1, requires: [], provides, longevity: 64, propagate: true },
    })
    .toHex()

/** A chain whose runtime answers `validateExtrinsic` with `validity`, and whose registry decodes like polkadot.js. */
const chainWith = (validity: Record<HexString, HexString>) =>
  ({
    head: {
      registry: Promise.resolve({
        createType: (type: string, value: unknown) => {
          if (type !== 'GenericExtrinsic') return registry.createType(type, value)
          if (value === SIGNED) return { signer: { toString: () => ALICE } }
          // polkadot.js skips the payload of every transaction extension it does not know, as on People Next.
          throw new Error('createType(GenericExtrinsic):: createType(GeneralExtrinsic):: decodeU8aStruct: failed')
        },
      }),
      call: async () => ({ result: '0x00000000' }),
    },
    validateExtrinsic: async (extrinsic: HexString) =>
      registry.createType<TransactionValidity>('TransactionValidity', validity[extrinsic]),
  }) as unknown as Blockchain

const realChain = () => chainWith({ [GENERAL_0]: VALIDITY_0, [GENERAL_1]: VALIDITY_1 })

describe('TxPool', () => {
  it('files a general extrinsic under the account its nonce tag names', async () => {
    const pool = new TxPool(realChain(), [], BuildBlockMode.Manual)
    await pool.submitExtrinsic(GENERAL_0)
    expect(pool.pendingExtrinsics).toEqual([GENERAL_0])
    expect(pool.pendingExtrinsicsBy(ALICE)).toEqual([GENERAL_0])
  })

  it('still files a signed extrinsic under its signer', async () => {
    const pool = new TxPool(realChain(), [], BuildBlockMode.Manual)
    await pool.submitExtrinsic(SIGNED)
    await pool.submitExtrinsic(GENERAL_0)
    expect(pool.pendingExtrinsics).toEqual([SIGNED, GENERAL_0])
    expect(pool.pendingExtrinsicsBy(ALICE)).toEqual([SIGNED, GENERAL_0])
  })

  it('counts pending general extrinsics in system_accountNextIndex', async () => {
    const chain = realChain()
    const pool = new TxPool(chain, [], BuildBlockMode.Manual)
    Object.assign(chain, { txPool: pool })
    const nextIndex = () =>
      system_accountNextIndex({ chain } as Context, [ALICE as HexString], {} as SubscriptionManager)
    expect(await nextIndex()).toBe(0)
    await pool.submitExtrinsic(GENERAL_0)
    expect(await nextIndex()).toBe(1)
    await pool.submitExtrinsic(GENERAL_1)
    expect(await nextIndex()).toBe(2)
  })

  const signerOf = async (validity: HexString) => {
    const pool = new TxPool(chainWith({ [GENERAL_0]: validity }), [], BuildBlockMode.Manual)
    await pool.submitExtrinsic(GENERAL_0)
    expect(pool.pendingExtrinsics).toEqual([GENERAL_0])
    return pool.pendingExtrinsicsBy(ALICE)
  }

  it('reads the account tag among tags of other lengths', async () => {
    expect(await signerOf(valid(['0x0102', ALICE_TAG]))).toEqual([GENERAL_0])
  })

  it.each([
    ['no account tag', valid([])],
    ['two account tags', valid([ALICE_TAG, BOB_TAG])],
    ['an invalid result', registry.createType('TransactionValidity', { err: { invalid: { badProof: null } } }).toHex()],
  ])('keeps a general extrinsic with %s, without a signer', async (_, validity) => {
    expect(await signerOf(validity)).toEqual([])
  })
})
