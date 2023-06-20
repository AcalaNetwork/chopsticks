import { describe, expect, it } from 'vitest'

import { api, delay, dev, env, expectHex, expectJson, mockCallback, setupApi } from './helper'

setupApi(env.mandala)

describe('chain rpc', () => {
  it('getXXX', async () => {
    const hashHead = '0xb0d0c3a59a08e21090211be38f5cac5162c7bf58b0cc751e0efc7ee8e10b3432'
    const hash0 = '0x3035b88c212be330a1a724c675d56d53a5016ec32af1790738832db0227ac54c'
    const hash1000 = '0xe56f236c84a86ebd36f07a2119156d83b28b5a0a02fbd3dfe2a2f333468838eb'

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
