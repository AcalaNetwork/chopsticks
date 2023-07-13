import { beforeEach, describe, it } from 'vitest'

import { DownwardMessage, HorizontalMessage } from '@acala-network/chopsticks/blockchain/txpool'
import { connectDownward } from '@acala-network/chopsticks/xcm/downward'
import { connectUpward } from '@acala-network/chopsticks/xcm/upward'
import { matchSystemEvents, testingPairs } from '@acala-network/chopsticks-testing'
import { setStorage } from '@acala-network/chopsticks/utils/set-storage'

import { matchSnapshot } from './helper'
import networks, { Network } from './networks'

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
  let acala: Network
  let polkadot: Network

  beforeEach(async () => {
    acala = await networks.acala()
    polkadot = await networks.polkadot()

    return async () => {
      await acala.teardown()
      await polkadot.teardown()
    }
  })

  it('Acala handles downward messages', async () => {
    await acala.chain.newBlock({ downwardMessages })
    await matchSystemEvents(acala)
  })

  it('Acala handles horizonal messages', async () => {
    await acala.chain.newBlock({ horizontalMessages })
    await matchSystemEvents(acala)
  })

  it('Polkadot send downward messages to Acala', async () => {
    await connectDownward(polkadot.chain, acala.chain)

    const { alice } = testingPairs()

    polkadot.dev.setStorage({
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
        0,
      )
      .signAndSend(alice)

    await polkadot.chain.newBlock()
    await matchSystemEvents(polkadot)

    await acala.chain.newBlock()
    await matchSystemEvents(acala)
  })

  it('Acala send upward messages to Polkadot', async () => {
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
        },
      )
      .signAndSend(alice)

    await acala.chain.newBlock()
    await matchSystemEvents(acala)
    await matchSnapshot(acala.api.query.tokens.accounts(alice.address, { token: 'DOT' }))

    await polkadot.chain.newBlock()

    await matchSnapshot(polkadot.api.query.system.account(alice.address))
    await matchSystemEvents(polkadot)
  })
})
