import { describe, expect, it } from 'vitest'

import { api, chain, dev, env, setupApi, testingPairs } from './helper'

setupApi(env.mandala)

describe('dry-run-extrinsic', () => {
  it('can dry run extrinsic', async () => {
    const properties = await chain.api.chainProperties
    const { alice, bob } = testingPairs(properties.ss58Format)

    await dev.setStorages({
      System: {
        Account: [[[alice.address], { data: { free: 1000 * 1e12 } }]],
      },
    })
    const extrinsic = await api.tx.balances.transfer(bob.address, 1e12).signAsync(alice)
    const { outcome, storageDiff } = await chain.dryRunExtrinsic(extrinsic.toHex())
    expect(outcome.toHuman()).toMatchSnapshot()
    expect(storageDiff).toMatchSnapshot()
  })
})
