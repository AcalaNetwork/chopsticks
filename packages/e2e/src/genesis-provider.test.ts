import { describe, expect, it } from 'vitest'

import { api, chain, dev, env, expectJson, setupApi, testingPairs } from './helper.js'

setupApi(env.mandalaGenesis)

describe('genesis provider works', () => {
  it('build blocks', async () => {
    expect(await dev.newBlock()).toMatchInlineSnapshot(
      '"0xcacc274d53b81070033e1b14b4162917be2754ecffaa31943cff06c39d2a8720"',
    )
    const block = await chain.getBlock('0xcacc274d53b81070033e1b14b4162917be2754ecffaa31943cff06c39d2a8720')
    expect(block).toBeTruthy
    expect(block?.number).toBe(1)
  })

  it('handles tx', async () => {
    await dev.newBlock()

    const { alice, bob } = testingPairs()

    await dev.setStorage({
      System: {
        Account: [[[alice.address], { data: { free: 1000 * 1e12 } }]],
      },
    })

    expectJson(await api.query.system.account(alice.address)).toMatchSnapshot()

    await api.tx.currencies.transferNativeCurrency(bob.address, 100 * 1e12).signAndSend(alice)

    await dev.newBlock()

    expectJson(await api.query.system.account(alice.address)).toMatchSnapshot()
    expectJson(await api.query.system.account(bob.address)).toMatchSnapshot()
  })
})
