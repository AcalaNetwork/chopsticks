import { connectHorizontal } from '@acala-network/chopsticks-core/xcm/horizontal.js'
import { describe, it } from 'vitest'

import { checkSystemEvents, setupContext, testingPairs } from './helper.js'
import networks from './networks.js'

describe('connectHorizontal', () => {
  it('connectHorizontal opens channel', async () => {
    const { alice } = testingPairs()
    const acala = await networks.acala({ blockNumber: 5729464 })
    await acala.dev.setStorage({
      System: {
        Account: [[[alice.address], { providers: 1, data: { free: 1000e12 } }]],
      },
    })

    // Use a second parachain (Polkadot Asset Hub)
    const assetHub = await setupContext({
      endpoint: 'wss://asset-hub-polkadot-rpc.n.dwellir.com',
      blockNumber: 16540000,
      db: !process.env.RUN_TESTS_WITHOUT_DB ? 'e2e-tests-db.sqlite' : undefined,
    })

    await connectHorizontal({
      2000: acala.chain,
      1000: assetHub.chain,
    })

    await acala.dev.newBlock()
    await assetHub.dev.newBlock()

    // This tx will be sent to Asset Hub and fail but it's fine for this test as we only want to test the connection
    await acala.api.tx.xTokens
      .transfer(
        {
          Token: 'ACA',
        },
        1e12,
        {
          V3: {
            parents: 1,
            interior: {
              X2: [
                {
                  Parachain: 1000,
                },
                {
                  AccountId32: {
                    id: alice.addressRaw,
                  },
                },
              ],
            },
          },
        },
        {
          Unlimited: null,
        },
      )
      .signAndSend(alice)

    await acala.dev.newBlock()
    await checkSystemEvents(acala, 'xcmpQueue', 'XcmpMessageSent').toMatchSnapshot()

    await assetHub.dev.newBlock()
    await checkSystemEvents(assetHub, 'messageQueue').toMatchSnapshot()

    await acala.teardown()
    await assetHub.teardown()
  })
})
