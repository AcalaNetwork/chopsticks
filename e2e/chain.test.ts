import { describe, expect, it } from 'vitest'

import { api, delay, dev, expectHex, expectJson, mockCallback } from './helper'

describe('chain rpc', () => {
  it('getXXX', async () => {
    const hashHead = '0x062327512615cd62ea8c57652a04a6c937b112f1410520d83e2fafb9776cdbe1'
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

    expect(await dev.newBlock()).toMatchSnapshot()

    await expectHex(api.rpc.chain.getBlockHash()).toMatchSnapshot()
    await expectJson(api.rpc.chain.getHeader()).toMatchSnapshot()
    await expectJson(api.rpc.chain.getBlock()).toMatchSnapshot()
  })

  it('subscribeNewHeads', async () => {
    const { callback, next } = mockCallback()
    const unsub = await api.rpc.chain.subscribeNewHeads(callback)

    await next()
    expect(callback.mock.calls).toMatchSnapshot()

    callback.mockClear()

    expect(await dev.newBlock()).toMatchSnapshot()

    await next()

    expect(callback.mock.calls).toMatchSnapshot()

    callback.mockClear()

    unsub()

    expect(await dev.newBlock()).toMatchSnapshot()

    await delay(100)

    expect(callback).not.toHaveBeenCalled()
  })
})
