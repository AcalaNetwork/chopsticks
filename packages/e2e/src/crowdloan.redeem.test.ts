import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { testingPairs } from '@acala-network/chopsticks-testing'

import networks from './networks.js'

describe('Polkadot Crowdloan Refund', async () => {
  const { alice } = testingPairs()
  const { api, dev, teardown } = await networks.polkadot({ blockNumber: 17700000, timeout: 400_000 })

  beforeAll(async () => {
    // make sure crowdloan is ended
    await dev.newBlock({ unsafeBlockHeight: 17855999, count: 3 })

    // give alice some DOTs for transaction fee
    await dev.setStorage({
      System: {
        Account: [[[alice.address], { providers: 1, data: { free: 1000 * 1e10 } }]],
      },
    })
  }, 200_000)

  it.runIf(process.env.CI || process.env.RUN_ALL)(
    "should refund Acala's contributors",
    async () => {
      // trigger refund
      await expect(api.tx.crowdloan.refund(3336).signAndSend(alice)).resolves.toBeTruthy()
      await dev.newBlock()

      {
        // 1000 accounts get refunded and crowdloan is partially refunded
        const events = await api.query.system.events()
        expect(events.filter((event) => event.event.method === 'Transfer').length === 1000).toBeTruthy()
        expect(events.toHuman()).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              event: expect.objectContaining({
                method: 'Transfer',
                section: 'balances',
                data: expect.objectContaining({
                  from: '13UVJyLnbVp77Z2t6qZV4fNpRjDHppL6c87bHcZKG48tKJad',
                  to: '111DbHPUxncZcffEfy1BrtFZNDUzK7hHchLpmJYFEFG4hy1',
                  amount: '1,000,000,000,000',
                }),
              }),
            }),
            expect.objectContaining({
              event: expect.objectContaining({
                method: 'PartiallyRefunded',
                section: 'crowdloan',
                data: expect.objectContaining({
                  paraId: '3,336',
                }),
              }),
            }),
          ]),
        )
      }

      await expect(api.tx.crowdloan.refund(3336).signAndSend(alice)).resolves.toBeTruthy()
      await dev.newBlock()

      {
        // 1000 accounts get refunded and crowdloan is partially refunded
        const events = await api.query.system.events()
        expect(events.filter((event) => event.event.method === 'Transfer').length === 1000).toBeTruthy()
        expect(events.toHuman()).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              event: expect.objectContaining({
                method: 'PartiallyRefunded',
                section: 'crowdloan',
                data: expect.objectContaining({
                  paraId: '3,336',
                }),
              }),
            }),
          ]),
        )
      }
    },
    { timeout: 400_000 },
  )

  it('withdraw funds from crowdloan', async () => {
    const expectedEvent = expect.arrayContaining([
      expect.objectContaining({
        event: expect.objectContaining({
          method: 'Transfer',
          section: 'balances',
          data: expect.objectContaining({
            from: '13UVJyLnbVp77Z2t6qZV4fNpRjDHppL6c87bHcZKG48tKJad',
            to: '1TkyFWT8PkGiFAD4pcnq8nB2RModtod1Hk4yLoVYbMtzagW',
            amount: '50,000,000,000',
          }),
        }),
      }),
    ])

    // trigger refund
    await expect(
      api.tx.crowdloan.withdraw('1TkyFWT8PkGiFAD4pcnq8nB2RModtod1Hk4yLoVYbMtzagW', 3336).signAndSend(alice),
    ).resolves.toBeTruthy()
    await dev.newBlock()
    expect((await api.query.system.events()).toHuman()).toEqual(expectedEvent)

    // doing the same thing again should fail because the funds are already withdrawn
    await expect(
      api.tx.crowdloan.withdraw('1TkyFWT8PkGiFAD4pcnq8nB2RModtod1Hk4yLoVYbMtzagW', 3336).signAndSend(alice),
    ).resolves.toBeTruthy()
    await dev.newBlock()
    expect((await api.query.system.events()).toHuman()).not.toEqual(expectedEvent)
  })

  afterAll(async () => await teardown())
})
