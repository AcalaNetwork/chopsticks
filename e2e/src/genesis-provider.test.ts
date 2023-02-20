import { describe, expect, it } from 'vitest'

import { api, chain, dev, env, expectJson, setupApi, testingPairs } from './helper'

setupApi(env.mandalaGenesis)

describe('genesis provider works', () => {
  it('build blocks', async () => {
    expect(await dev.newBlock()).toMatchInlineSnapshot(
      '"0xcacc274d53b81070033e1b14b4162917be2754ecffaa31943cff06c39d2a8720"'
    )
    const block = await chain.getBlock('0xcacc274d53b81070033e1b14b4162917be2754ecffaa31943cff06c39d2a8720')
    expect(block).toBeTruthy
    expect(block?.number).toBe(1)
  })

  it('handles tx', async () => {
    await dev.newBlock()

    const properties = await chain.api.chainProperties
    const { test1, test2 } = testingPairs(properties.ss58Format)

    await dev.setStorage({
      System: {
        Account: [[[test1.address], { data: { free: 1000 * 1e12 } }]],
      },
    })

    await expectJson(api.query.system.account(test1.address)).toMatchSnapshot()

    await api.tx.currencies.transferNativeCurrency(test2.address, 100 * 1e12).signAndSend(test1)

    await dev.newBlock()

    await expectJson(api.query.system.account(test1.address)).toMatchSnapshot()
    await expectJson(api.query.system.account(test2.address)).toMatchSnapshot()
  })
})
