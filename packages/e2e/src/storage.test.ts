import '@polkadot/api-augment'
import { describe, expect, it } from 'vitest'

import { api, delay, dev, env, expectJson, mockCallback, setupApi } from './helper'

setupApi(env.mandala)

describe('storage', () => {
  it('getStorage', async () => {
    expectJson(await api.query.timestamp.now()).toMatchSnapshot()
    expectJson(await api.query.system.account('5F98oWfz2r5rcRVnP9VCndg33DAAsky3iuoBSpaPUbgN9AJn')).toMatchSnapshot()

    const apiAt = await api.at('0x6aa33cc6b9bfa9bbc3144597da05a1dfd3bf2d16fc52f67c1687fc4e7c8ced5f')

    expectJson(await apiAt.query.timestamp.now()).toMatchSnapshot()
    expectJson(await apiAt.query.system.account('5F98oWfz2r5rcRVnP9VCndg33DAAsky3iuoBSpaPUbgN9AJn')).toMatchSnapshot()
  })

  it('getStorageMulti', async () => {
    expectJson(
      await api.query.system.account.multi([
        '5F98oWfz2r5rcRVnP9VCndg33DAAsky3iuoBSpaPUbgN9AJn',
        '5Fe3jZRbKes6aeuQ6HkcTvQeNhkkRPTXBwmNkuAPoimGEv45',
        '5EMjsczLB8VLkyWNp8b9v5bnGcNEgeW2PVdFqNmQFPoB6sxk',
      ])
    ).toMatchSnapshot()

    const apiAt = await api.at('0x6aa33cc6b9bfa9bbc3144597da05a1dfd3bf2d16fc52f67c1687fc4e7c8ced5f')

    expectJson(
      await apiAt.query.system.account.multi([
        '5F98oWfz2r5rcRVnP9VCndg33DAAsky3iuoBSpaPUbgN9AJn',
        '5Fe3jZRbKes6aeuQ6HkcTvQeNhkkRPTXBwmNkuAPoimGEv45',
        '5EMjsczLB8VLkyWNp8b9v5bnGcNEgeW2PVdFqNmQFPoB6sxk',
      ])
    ).toMatchSnapshot()
  })

  it('getKeysPaged', async () => {
    const entries = await api.query.system.account.entriesPaged({ args: [], pageSize: 10 })
    expect(entries).toMatchSnapshot()

    const entries2 = await api.query.system.account.entriesPaged({
      args: [],
      pageSize: 10,
      startKey: entries[entries.length - 1][0].toHex(),
    })
    expect(entries2).toMatchSnapshot()
  })

  it('getKeysPagedAt', async () => {
    const apiAt = await api.at('0x6aa33cc6b9bfa9bbc3144597da05a1dfd3bf2d16fc52f67c1687fc4e7c8ced5f')

    const entries = await apiAt.query.system.account.entriesPaged({ args: [], pageSize: 10 })
    expect(entries).toMatchSnapshot()

    const entries2 = await apiAt.query.system.account.entriesPaged({
      args: [],
      pageSize: 10,
      startKey: entries[entries.length - 1][0].toHex(),
    })
    expect(entries2).toMatchSnapshot()
  })

  it('subscription', async () => {
    const { callback, next } = mockCallback()
    const unsub = await api.query.timestamp.now(callback)

    await next()

    expect(callback.mock.calls).toMatchSnapshot()
    callback.mockClear()

    expect(await dev.newBlock()).toMatchInlineSnapshot(
      '"0xadaa12ed69b66fa094b0d30c408b61dd944529981d9e902f15ed22ef3db54fed"'
    )

    await next()

    expect(callback.mock.calls).toMatchSnapshot()
    callback.mockClear()

    unsub()

    expect(await dev.newBlock()).toMatchInlineSnapshot(
      '"0x713d3e542b7ac7a4d446f10dc58b411ac6644ef1fd16f702941f4d7119116e17"'
    )

    await delay(100)

    expect(callback).not.toHaveBeenCalled()
  })
})
