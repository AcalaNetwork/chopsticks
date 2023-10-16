import { describe, expect, it } from 'vitest'

import { api, delay, dev, env, expectHex, expectJson, mockCallback, setupApi } from './helper'

setupApi(env.acala)

describe('chain rpc', () => {
  it('getXXX', async () => {
    const hashHead = '0x0df086f32a9c3399f7fa158d3d77a1790830bd309134c5853718141c969299c7'
    const hash0 = '0xfc41b9bd8ef8fe53d58c7ea67c794c7ec9a73daf05e6d54b14ff6342c99ba64c'
    const hash1000 = '0x1d2927c6b4aca4c42cb1f88ed7fa46dc53118bb00370475aaf514ac88933e3cc'

    expectHex(await api.rpc.chain.getBlockHash()).toMatch(hashHead)
    expectHex(await api.rpc.chain.getBlockHash(0)).toMatch(hash0)
    expectHex(await api.rpc.chain.getBlockHash(1000)).toMatch(hash1000)

    expect(await api.rpc('chain_getHead')).toEqual(hashHead)
    expect(await api.rpc('chain_getBlockHash', null)).toEqual(hashHead)
    expect(await api.rpc('chain_getBlockHash', undefined)).toEqual(hashHead)
    expect(await api.rpc('chain_getBlockHash', [null])).toEqual(expect.arrayContaining([hashHead]))
    expect(await api.rpc('chain_getBlockHash', [undefined])).toEqual(expect.arrayContaining([hashHead]))
    expect(await api.rpc('chain_getBlockHash', [0, 1000])).toEqual(expect.arrayContaining([hash0, hash1000]))
    expect(await api.rpc('chain_getBlockHash', [0, undefined, null])).toEqual(
      expect.arrayContaining([hash0, hashHead, hashHead]),
    )

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
