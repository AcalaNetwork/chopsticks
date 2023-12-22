import { beforeEach, describe, it } from 'vitest'

import { DownwardMessage } from '@acala-network/chopsticks-core/blockchain/txpool.js'
import { connectDownward } from '@acala-network/chopsticks-core/xcm/downward.js'
import { connectUpward } from '@acala-network/chopsticks-core/xcm/upward.js'
import { setStorage } from '@acala-network/chopsticks-core'

import { check, checkSystemEvents, testingPairs } from './helper.js'
import networks, { Network } from './networks.js'

const downwardMessages: DownwardMessage[] = [
  {
    sentAt: 1,
    msg: '0x0210010400010000078155a74e390a1300010000078155a74e39010300286bee0d01000400010100c0cbffafddbe39f71f0190c2369adfc59eaa4c81a308ebcad88cdd9c400ba57c',
  },
]

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
    await checkSystemEvents(acala).toMatchSnapshot()
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
    await checkSystemEvents(polkadot).toMatchSnapshot()

    await acala.chain.newBlock()
    await checkSystemEvents(acala).toMatchSnapshot()
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

    await check(polkadot.api.query.system.account(alice.address)).toMatchSnapshot()
    await check(acala.api.query.system.account(alice.address)).toMatchSnapshot()
    await check(acala.api.query.tokens.accounts(alice.address, { token: 'DOT' })).toMatchSnapshot()

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
    await checkSystemEvents(acala).toMatchSnapshot()
    await check(acala.api.query.tokens.accounts(alice.address, { token: 'DOT' })).toMatchSnapshot()

    await polkadot.chain.newBlock()

    await check(polkadot.api.query.system.account(alice.address)).toMatchSnapshot()
    await checkSystemEvents(polkadot).toMatchSnapshot()
  })
})
