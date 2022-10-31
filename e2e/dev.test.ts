import { describe, it } from 'vitest'
import { u8aToHex } from '@polkadot/util'

import { api, dev, expectJson, testingPairs } from './helper'

describe('dev rpc', () => {
  it('setStorages', async () => {
    const { alice, test1 } = testingPairs()

    await expectJson(api.query.sudo.key()).toMatchSnapshot()

    await dev.setStorages({
      [api.query.sudo.key.key()]: u8aToHex(alice.addressRaw),
    })

    await expectJson(api.query.sudo.key()).toMatchSnapshot()

    await api.tx.sudo.sudo(api.tx.balances.setBalance(test1.address, 1000000000000, 0)).signAndSend(alice)
    const hash = await dev.newBlock()

    await expectJson(api.query.system.account(test1.address)).toMatchSnapshot()

    await dev.setStorages(
      {
        [api.query.system.account.key(test1.address)]: null,
      },
      hash
    )

    await expectJson(api.query.system.account(test1.address)).toMatchSnapshot()
  })
})
