import { describe, expect, it } from 'vitest'

import { api, delay, dev, env, expectHex, expectJson, mockCallback, setupApi } from './helper'

setupApi(env.mandala)

describe('chain rpc', () => {
  it('getXXX', async () => {
    const hashHead = '0x062327512615cd62ea8c57652a04a6c937b112f1410520d83e2fafb9776cdbe1'
    const hash0 = '0x23fc729c2cdb7bd6770a4e8c58748387cc715fcf338f1f74a16833d90383f4b0'
    const hash1000 = '0x7fbf942ac7a197ed6c9ecb7733bb1d42347b7b88c32973857cc13bd98febbbab'

    expectHex(await api.rpc.chain.getBlockHash()).toMatch(hashHead)
    expectHex(await api.rpc.chain.getBlockHash(0)).toMatch(hash0)
    expectHex(await api.rpc.chain.getBlockHash(1000)).toMatch(hash1000)

    expectJson(await api.rpc.chain.getHeader()).toMatchSnapshot()
    expectJson(await api.rpc.chain.getHeader(hashHead)).toMatchSnapshot()
    expectJson(await api.rpc.chain.getHeader(hash0)).toMatchSnapshot()
    expectJson(await api.rpc.chain.getHeader(hash1000)).toMatchSnapshot()

    expectJson(await api.rpc.chain.getBlock()).toMatchSnapshot()
    expectJson(await api.rpc.chain.getBlock(hashHead)).toMatchSnapshot()
    expectJson(await api.rpc.chain.getBlock(hash0)).toMatchSnapshot()
    expectJson(await api.rpc.chain.getBlock(hash1000)).toMatchSnapshot()

    expectHex(await api.rpc.chain.getFinalizedHead()).toMatch(hashHead)

    expect(await dev.newBlock()).toMatchSnapshot()

    expectHex(await api.rpc.chain.getBlockHash()).toMatchSnapshot()
    expectJson(await api.rpc.chain.getHeader()).toMatchSnapshot()
    expectJson(await api.rpc.chain.getBlock()).toMatchSnapshot()
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
