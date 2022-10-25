/* eslint-disable no-async-promise-executor */

import { describe, expect, it } from 'vitest'

import { api, expectHex, expectJson } from './helper'

describe('chain rpc', () => {
  it('getXXX', async () => {
    const hashHead = '0x68cff8682eda3e5e63b375253bdb3a01f0dce1879fe7ade97c9697406c56b55a'
    const hash0 = '0x23fc729c2cdb7bd6770a4e8c58748387cc715fcf338f1f74a16833d90383f4b0'
    const hash1000 = '0x7fbf942ac7a197ed6c9ecb7733bb1d42347b7b88c32973857cc13bd98febbbab'

    await expectHex(api.rpc.chain.getBlockHash()).toMatch(hashHead)
    await expectHex(api.rpc.chain.getBlockHash(0)).toMatch(hash0)
    await expectHex(api.rpc.chain.getBlockHash(1000)).toMatch(hash1000)

    await expectJson(api.rpc.chain.getHeader()).toMatchSnapshot()
    await expectJson(api.rpc.chain.getHeader(hashHead)).toMatchSnapshot()
    await expectJson(api.rpc.chain.getHeader(hash0)).toMatchSnapshot()
    await expectJson(api.rpc.chain.getHeader(hash1000)).toMatchSnapshot()

    await expectJson(api.rpc.chain.getBlock()).toMatchSnapshot()
    await expectJson(api.rpc.chain.getBlock(hashHead)).toMatchSnapshot()
    await expectJson(api.rpc.chain.getBlock(hash0)).toMatchSnapshot()
    await expectJson(api.rpc.chain.getBlock(hash1000)).toMatchSnapshot()

    await expectHex(api.rpc.chain.getFinalizedHead()).toMatch(hashHead)

    // TODO: advance block and have more tests
  })

  it('subscribeNewHeads', async () => {
    await new Promise<void>(async (resolve) => {
      const unsub = await api.rpc.chain.subscribeNewHeads((header) => {
        expect(header.toJSON()).toMatchSnapshot()
        unsub()
        resolve()
      })
    })

    // TODO: advance block and have more tests and unsure unsubscribe works
  })
})
