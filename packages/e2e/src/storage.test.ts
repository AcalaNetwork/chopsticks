import '@polkadot/api-augment'
import { describe, expect, it } from 'vitest'

import { api, check, delay, dev, env, mockCallback, setupApi } from './helper.js'

setupApi(env.acala)

describe('storage', () => {
  it('getStorage', async () => {
    await check(api.query.timestamp.now()).toMatchSnapshot()
    await check(api.query.system.account('5F98oWfz2r5rcRVnP9VCndg33DAAsky3iuoBSpaPUbgN9AJn')).toMatchSnapshot()

    const apiAt = await api.at('0xfc41b9bd8ef8fe53d58c7ea67c794c7ec9a73daf05e6d54b14ff6342c99ba64c')

    await check(apiAt.query.timestamp.now()).toMatchSnapshot()
    await check(apiAt.query.system.account('5F98oWfz2r5rcRVnP9VCndg33DAAsky3iuoBSpaPUbgN9AJn')).toMatchSnapshot()
  })

  it('getStorageMulti', async () => {
    await check(
      await api.query.system.account.multi([
        '23RDJ7SyVgpKqC6M9ad8wvbBsbSr3R4Xqr5NQAKEhWPHbLbs',
        '249QskFMEcb5WcgHF7BH5MesVGHq3imsUACq2RPgtBBdCPMa',
        '263KsUutx8qhRmG7hq6fEaSKE3fdi3KeeEKafkAMJ1cg1AYc',
      ]),
    ).toMatchSnapshot()

    const apiAt = await api.at('0xfc41b9bd8ef8fe53d58c7ea67c794c7ec9a73daf05e6d54b14ff6342c99ba64c')

    await check(
      apiAt.query.system.account.multi([
        '23RDJ7SyVgpKqC6M9ad8wvbBsbSr3R4Xqr5NQAKEhWPHbLbs',
        '249QskFMEcb5WcgHF7BH5MesVGHq3imsUACq2RPgtBBdCPMa',
        '263KsUutx8qhRmG7hq6fEaSKE3fdi3KeeEKafkAMJ1cg1AYc',
      ]),
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
    // 3,000,000
    const apiAt = await api.at('0xb5297d01adb0964d5195f9f17a3cf6e99ef8622e71863456eeb9296d5681292b')

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
    let tick = next()
    const unsub = await api.query.timestamp.now(callback)
    await tick

    expect(callback.mock.calls).toMatchSnapshot()
    callback.mockClear()

    tick = next()
    expect(await dev.newBlock()).toMatchInlineSnapshot(
      `"0xd93ac4e1814b874c059e647b9726f38c7f42ec673e171572d8e38992f6072b77"`,
    )
    await tick

    expect(callback.mock.calls).toMatchSnapshot()
    callback.mockClear()

    unsub()

    expect(await dev.newBlock()).toMatchInlineSnapshot(
      `"0xf9c6e17a227e188f64338f72626f44a84a55c3b959d9305db309bbed05f76de1"`,
    )

    await delay(100)

    expect(callback).not.toHaveBeenCalled()
  })
})
