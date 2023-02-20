import { afterAll, describe, it } from 'vitest'

import { DownwardMessage, HorizontalMessage } from '@acala-network/chopsticks/src/blockchain/txpool'
import { connectDownward } from '@acala-network/chopsticks/src/xcm/downward'
import { connectUpward } from '@acala-network/chopsticks/src/xcm/upward'
import { matchSnapshot, setupAll, testingPairs } from './helper'
import { setStorage } from '@acala-network/chopsticks/src/utils/set-storage'

const downwardMessages: DownwardMessage[] = [
  {
    sentAt: 1,
    msg: '0x0210010400010000078155a74e390a1300010000078155a74e39010300286bee0d01000400010100c0cbffafddbe39f71f0190c2369adfc59eaa4c81a308ebcad88cdd9c400ba57c',
  },
]

const horizontalMessages: Record<number, HorizontalMessage[]> = {
  2004: [
    {
      data: '0x000210000400000106080001000fc2ddd331d55e200a1300000106080001000fc2ddd331d55e20010700f2052a010d01000400010100ba686c8fa59178c699a698ea4d8e2c595394c2594bce4b6c2ca3a9bf3018e25d',
      sentAt: 13509121,
    },
  ],
}

describe('XCM', async () => {
  const ctxAcala = await setupAll({
    endpoint: 'wss://acala-rpc-1.aca-api.network',
    blockHash: '0x0defc0c9df164f9c4310239a9cfc4cab5fa6c7d8fa8fea44cc46ab39017e963a',
  })

  const ctxPolkadot = await setupAll({
    endpoint: 'wss://rpc.polkadot.io',
    blockHash: '0x0a26b277b252fc61efcda02e44e95c73bf7ae21233bacb2d3bd7631212350d59',
  })

  afterAll(async () => {
    await ctxAcala.teardownAll()
    await ctxPolkadot.teardownAll()
  })

  it('Acala handles downward messages', async () => {
    const { chain, api, teardown } = await ctxAcala.setup()
    await chain.newBlock({ inherent: { downwardMessages } })
    await matchSnapshot(api.query.system.events())
    await teardown()
  })

  it('Acala handles horizonal messages', async () => {
    const { chain, api, teardown } = await ctxAcala.setup()
    await chain.newBlock({ inherent: { horizontalMessages } })
    await matchSnapshot(api.query.system.events())
    await teardown()
  })

  it('Polkadot send downward messages to Acala', async () => {
    const polkadot = await ctxPolkadot.setup()
    const acala = await ctxAcala.setup()

    await connectDownward(polkadot.chain, acala.chain)

    const { alice } = testingPairs()

    await setStorage(polkadot.chain, {
      System: {
        Account: [[[alice.address], { data: { free: 1000 * 1e10 } }]],
      },
    })

    await polkadot.api.tx.xcmPallet
      .reserveTransferAssets(
        { V0: { X1: { Parachain: 2000 } } },
        {
          V0: {
            X1: {
              AccountId32: {
                network: 'Any',
                id: alice.addressRaw,
              },
            },
          },
        },
        {
          V0: [
            {
              ConcreteFungible: { id: 'Null', amount: 100e10 },
            },
          ],
        },
        0
      )
      .signAndSend(alice)

    await polkadot.chain.newBlock()
    await acala.chain.upcomingBlock()
    await matchSnapshot(polkadot.api.query.system.events())
    await matchSnapshot(acala.api.query.system.events())

    await polkadot.teardown()
    await acala.teardown()
  })

  it('Acala send upward messages to Polkadot', async () => {
    const polkadot = await ctxPolkadot.setup()
    const acala = await ctxAcala.setup()

    await connectUpward(acala.chain, polkadot.chain)

    const { alice } = testingPairs()

    await setStorage(acala.chain, {
      System: {
        Account: [[[alice.address], { data: { free: 1000 * 1e10 } }]],
      },
      Tokens: {
        Accounts: [[[alice.address, { token: 'DOT' }], { free: 1000e10 }]],
      },
    })

    await matchSnapshot(polkadot.api.query.system.account(alice.address))
    await matchSnapshot(acala.api.query.system.account(alice.address))
    await matchSnapshot(acala.api.query.tokens.accounts(alice.address, { token: 'DOT' }))

    await acala.api.tx.xTokens
      .transfer(
        {
          Token: 'DOT',
        },
        10e10,
        {
          V1: {
            parents: 1,
            interior: {
              X1: {
                AccountId32: {
                  network: 'Any',
                  id: alice.addressRaw,
                },
              },
            },
          },
        },
        {
          Unlimited: null,
        }
      )
      .signAndSend(alice)

    await acala.chain.newBlock()
    await polkadot.chain.upcomingBlock()

    await matchSnapshot(acala.api.query.tokens.accounts(alice.address, { token: 'DOT' }))
    await matchSnapshot(polkadot.api.query.system.account(alice.address))
    await matchSnapshot(polkadot.api.query.system.events())
    await matchSnapshot(acala.api.query.system.events())

    await polkadot.teardown()
    await acala.teardown()
  })
})
