import { describe, expect, it } from 'vitest'

import { api, chain, dev, env, setupApi, testingPairs } from './helper'

setupApi({
  ...env.mandala,
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
    const ALICE = '5F9wnAAXTdeKxprAbEvgVvP1GeonyBQeUN16ei9NkgyVh1FC'

    await dev.setStorage({ Sudo: { Key: ALICE } })

    // sudo.sudo(system.remark(0x01))
    const call = '0xff0000000401'
    const { outcome, storageDiff } = await chain.dryRunExtrinsic({ call, address: ALICE })

    expect(outcome.toHuman()).toMatchSnapshot()
    expect(storageDiff).toMatchSnapshot()
  })
})
