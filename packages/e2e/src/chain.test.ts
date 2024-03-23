import { describe, expect, it } from 'vitest'

import { api, check, checkHex, delay, dev, env, mockCallback, setupApi } from './helper.js'

setupApi(env.acala)

describe('chain rpc', () => {
  it('getXXX', async () => {
    const hashHead = '0x0df086f32a9c3399f7fa158d3d77a1790830bd309134c5853718141c969299c7'
    const hash0 = '0xfc41b9bd8ef8fe53d58c7ea67c794c7ec9a73daf05e6d54b14ff6342c99ba64c'
    const hash1000 = '0x1d2927c6b4aca4c42cb1f88ed7fa46dc53118bb00370475aaf514ac88933e3cc'

    await checkHex(api.rpc.chain.getBlockHash()).toMatch(hashHead)
    await checkHex(api.rpc.chain.getBlockHash(0)).toMatch(hash0)
    await checkHex(api.rpc.chain.getBlockHash(1000)).toMatch(hash1000)

    expect(await api.rpc('chain_getHead')).toEqual(hashHead)
    expect(await api.rpc('chain_getBlockHash', null)).toEqual(hashHead)
    expect(await api.rpc('chain_getBlockHash', undefined)).toEqual(hashHead)
    expect(await api.rpc('chain_getBlockHash', [null])).toEqual(expect.arrayContaining([hashHead]))
    expect(await api.rpc('chain_getBlockHash', [undefined])).toEqual(expect.arrayContaining([hashHead]))
    expect(await api.rpc('chain_getBlockHash', [0, 1000])).toEqual(expect.arrayContaining([hash0, hash1000]))
    expect(await api.rpc('chain_getBlockHash', [0, undefined, null])).toEqual(
      expect.arrayContaining([hash0, hashHead, hashHead]),
    )

    await check(api.rpc.chain.getHeader()).toMatchSnapshot()
    await check(api.rpc.chain.getHeader(hashHead)).toMatchSnapshot()
    await check(api.rpc.chain.getHeader(hash0)).toMatchSnapshot()
    await check(api.rpc.chain.getHeader(hash1000)).toMatchSnapshot()

    await check(api.rpc.chain.getBlock()).toMatchSnapshot()
    await check(api.rpc.chain.getBlock(hashHead)).toMatchSnapshot()
    await check(api.rpc.chain.getBlock(hash0)).toMatchSnapshot()
    await check(api.rpc.chain.getBlock(hash1000)).toMatchSnapshot()

    await checkHex(api.rpc.chain.getFinalizedHead()).toMatch(hashHead)

    expect(await dev.newBlock()).toMatchSnapshot()

    await checkHex(api.rpc.chain.getBlockHash()).toMatchSnapshot()
    await check(api.rpc.chain.getHeader()).toMatchSnapshot()
    await check(api.rpc.chain.getBlock()).toMatchSnapshot()
  })

  it('header format correct', async () => {
    const header = await api.rpc(
      'chain_getHeader',
      '0x1d2927c6b4aca4c42cb1f88ed7fa46dc53118bb00370475aaf514ac88933e3cc',
    )
    expect(header).toMatchInlineSnapshot(`
      {
        "digest": {
          "logs": [
            "0x0661757261202b21250800000000",
            "0x05617572610101ba12b8f0cf97e0e0fcd885b889ae7e90b86277592690436b67eced4e0ef3e02ca094867287e94208a9d8a9e62402de9b4717247a6332bd55728420dbad0e8d8f",
          ],
        },
        "extrinsicsRoot": "0xe9033b0b86efaaa452fce2e3013806e480fa33195cfdd75d8263e5dc6acffffd",
        "number": "0x000003e8",
        "parentHash": "0x113384df3a413ca774ff5aebbef8045b9356493d9aeef5e59b036bd4bd3f21ba",
        "stateRoot": "0x33cb61d08934b1de5be3453801450f36082cb1a060cd760b427efc65e96be63b",
      }
    `)
  })

  it('subscribeNewHeads', async () => {
    const { callback, next } = mockCallback()
    let tick = next()
    const unsub = await api.rpc.chain.subscribeNewHeads(callback)
    await tick

    expect(callback.mock.calls).toMatchSnapshot()

    callback.mockClear()

    tick = next()
    expect(await dev.newBlock()).toMatchSnapshot()
    await tick

    expect(callback.mock.calls).toMatchSnapshot()

    callback.mockClear()

    unsub()

    expect(await dev.newBlock()).toMatchSnapshot()

    await delay(100)

    expect(callback).not.toHaveBeenCalled()
  })
})
