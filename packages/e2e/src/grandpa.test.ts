import { describe, expect, it } from 'vitest'

import { api, delay, dev, mockCallback, setupApi } from './helper.js'

setupApi({
  endpoint: ['wss://rpc.ibp.network/polkadot'],
  blockHash: '0xb012d04c56b65cfa1f47cb1f884d920f95d0097b1ed42f5da18d5e2a436c2f3e',
})

describe('grandpa rpc', () => {
  it('subscribeJustifications', async () => {
    const { callback, next } = mockCallback()
    const unsub = await api.rpc.grandpa.subscribeJustifications(callback)

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
