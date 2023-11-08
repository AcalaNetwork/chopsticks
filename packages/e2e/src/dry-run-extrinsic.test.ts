import { describe, expect, it } from 'vitest'

import { api, chain, dev, env, setupApi, testingPairs } from './helper.js'

setupApi({
  ...env.acala,
  mockSignatureHost: true,
})

describe('dry-run-extrinsic', () => {
  it('dry run extrinsic', async () => {
    const properties = await chain.api.chainProperties
    const { alice, bob } = testingPairs('ed25519', properties.ss58Format)

    await dev.setStorage({
      System: {
        Account: [[[alice.address], { providers: 1, data: { free: 1000 * 1e12 } }]],
      },
    })
    const extrinsic = await api.tx.balances.transfer(bob.address, 1e12).signAsync(alice)
    const { outcome, storageDiff } = await chain.dryRunExtrinsic(extrinsic.toHex())
    expect(outcome.toHuman()).toMatchSnapshot()
    expect(storageDiff).toMatchSnapshot()
  })

  it('dry run extrinsic with fake signature', async () => {
    const ALICE = '5FA9nQDVg267DEd8m1ZypXLBnvN7SFxYwV7ndqSYGiN9TTpu'
    await dev.setStorage({
      System: {
        Account: [[[ALICE], { providers: 1, data: { free: 1000 * 1e12 } }]],
      },
    })

    await dev.setStorage({ Sudo: { Key: ALICE } })

    // sudo.sudo(system.fillBlock(10000000))
    const call = '0xff00000080969800'
    const { outcome, storageDiff } = await chain.dryRunExtrinsic({ call, address: ALICE })

    expect(outcome.toHuman()).toMatchSnapshot()
    expect(storageDiff).toMatchSnapshot()
  })
})
