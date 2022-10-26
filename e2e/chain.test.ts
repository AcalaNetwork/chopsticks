import { describe, expect, it } from 'vitest'

import { api, delay, dev, expectHex, expectJson, mockCallback } from './helper'

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

    expect(await dev.newBlock()).toMatchInlineSnapshot(
      '"0x1ec9e0f282817d92307b4d0f46cb9c1149d941e6e622607793d56229d5ea83d6"'
    )

    await expectHex(api.rpc.chain.getBlockHash()).toMatchInlineSnapshot()
    await expectJson(api.rpc.chain.getHeader()).toMatchSnapshot()
    await expectJson(api.rpc.chain.getBlock()).toMatchSnapshot()
  })

  it.only('subscribeNewHeads', async () => {
    const { callback, next } = mockCallback()
    const unsub = await api.rpc.chain.subscribeNewHeads(callback)

    await next()
    expect(callback.mock.calls).toMatchSnapshot()

    callback.mockClear()

    expect(await dev.newBlock()).toMatchInlineSnapshot(
      '"0x5e29ae2538ffa601a9da913b75de8c95d0ce0bc7458756a094348d7f7e9b146a"'
    )

    await next()

    expect(callback.mock.calls).toMatchSnapshot()

    callback.mockClear()

    unsub()

    expect(await dev.newBlock()).toMatchInlineSnapshot(
      '"0xe300c88d4790076560300b914c7a742929121cb2812fd931f859aa97e38b9393"'
    )

    await delay(100)

    expect(callback).not.toHaveBeenCalled()
  })
})
