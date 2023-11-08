import { afterAll, describe, expect, it } from 'vitest'
import { testingPairs } from './helper.js'
import networks from './networks.js'

// SPECIAL TEST CASE. DO NOT CHANGE
describe('failed tx should revert storage changes', async () => {
  const { alice } = testingPairs()
  const { api, dev, teardown } = await networks.acala({ blockNumber: 3478171 })

  await dev.setStorage({
    System: {
      Account: [[[alice.address], { data: { free: 1000 * 1e12 } }]],
    },
    Tokens: {
      Accounts: [
        [[alice.address, { Token: 'AUSD' }], { free: 1000000000000000 }],
        [[alice.address, { Token: 'DOT' }], { free: 1000000000000000 }],
        [[alice.address, { Token: 'LDOT' }], { free: 1000000000000000 }],
      ],
    },
    Homa: { $removePrefix: ['redeemRequests', 'unbondings', 'toBondPool'] },
  })

  afterAll(async () => {
    await teardown()
  })

  it('works', async () => {
    await api.tx.honzon.adjustLoan({ Token: 'DOT' }, 1000000000000, 1000000000000000).signAndSend(alice)
    await dev.newBlock()
    await api.tx.honzon.closeLoanHasDebitByDex({ Token: 'DOT' }, 1000000000000).signAndSend(alice)
    await dev.newBlock()
    const events = await api.query.system.events()
    expect(events.toHuman()).toMatchSnapshot()
  })
})
