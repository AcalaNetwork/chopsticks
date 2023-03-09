import '@polkadot/api-augment'
import { describe, expect, it } from 'vitest'

import { api, delay, dev, env, expectJson, mockCallback, setupApi } from './helper'

setupApi(env.mandala)

describe('storage', () => {
  it('getStorage', async () => {
    expectJson(await api.query.timestamp.now()).toMatchSnapshot()
    expectJson(await api.query.system.account('5F98oWfz2r5rcRVnP9VCndg33DAAsky3iuoBSpaPUbgN9AJn')).toMatchSnapshot()

    const apiAt = await api.at('0x7fbf942ac7a197ed6c9ecb7733bb1d42347b7b88c32973857cc13bd98febbbab')

    expectJson(await apiAt.query.timestamp.now()).toMatchSnapshot()
    expectJson(await apiAt.query.system.account('5F98oWfz2r5rcRVnP9VCndg33DAAsky3iuoBSpaPUbgN9AJn')).toMatchSnapshot()
  })

  it('getStorageMulti', async () => {
    expectJson(
      await api.query.system.account.multi([
        '5F98oWfz2r5rcRVnP9VCndg33DAAsky3iuoBSpaPUbgN9AJn',
        '5Fe3jZRbKes6aeuQ6HkcTvQeNhkkRPTXBwmNkuAPoimGEv45',
        '5GBc9povce1rJR4Zcp2dfM2TciM6MjFRMq6apRBATUicBU7q',
      ])
    ).toMatchSnapshot()

    const apiAt = await api.at('0x7fbf942ac7a197ed6c9ecb7733bb1d42347b7b88c32973857cc13bd98febbbab')

    expectJson(
      await apiAt.query.system.account.multi([
        '5F98oWfz2r5rcRVnP9VCndg33DAAsky3iuoBSpaPUbgN9AJn',
        '5Fe3jZRbKes6aeuQ6HkcTvQeNhkkRPTXBwmNkuAPoimGEv45',
        '5GBc9povce1rJR4Zcp2dfM2TciM6MjFRMq6apRBATUicBU7q',
      ])
    ).toMatchSnapshot()
  })

  it('getKeysPaged', async () => {
    const entries = await api.query.tokens.accounts.entriesPaged({ args: [], pageSize: 10 })
    expect(entries).toMatchSnapshot()

    const entries2 = await api.query.tokens.accounts.entriesPaged({
      args: [],
      pageSize: 10,
      startKey: entries[entries.length - 1][0].toHex(),
    })
    expect(entries2).toMatchSnapshot()
  })

  it('getKeysPagedAt', async () => {
    const apiAt = await api.at('0x7fbf942ac7a197ed6c9ecb7733bb1d42347b7b88c32973857cc13bd98febbbab')

    const entries = await apiAt.query.tokens.accounts.entriesPaged({ args: [], pageSize: 10 })
    expect(entries).toMatchSnapshot()

    const entries2 = await apiAt.query.tokens.accounts.entriesPaged({
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
      '"0xec771ba3da1ba2af1dd61e78d6ec510696c2aa857dabd11d9f165f7919fa614f"'
    )

    await next()

    expect(callback.mock.calls).toMatchSnapshot()
    callback.mockClear()

    unsub()

    expect(await dev.newBlock()).toMatchInlineSnapshot(
      '"0x1e4d7e624014418ad8b5fe082739be4aa662c40a42e1c768413382897252e428"'
    )

    await delay(100)

    expect(callback).not.toHaveBeenCalled()
  })
})
