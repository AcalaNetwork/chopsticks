import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { testingPairs } from '@acala-network/chopsticks-testing'

import networks from './networks'

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

  it(
    "should refund Acala's contributers",
    async () => {
      // trigger refund
      await expect(api.tx.crowdloan.refund(3336).signAndSend(alice)).resolves.toBeTruthy()
      await dev.newBlock()

      // some address get refund
      expect((await api.query.system.events()).toHuman()).toEqual(
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
        ]),
      )
    },
    { timeout: 400_000 },
  )

  afterAll(async () => await teardown())
})
