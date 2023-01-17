import { afterAll, describe, it } from 'vitest'

import { DownwardMessage, HorizontalMessage } from '../src/blockchain/txpool'
import { connectDownward } from '../src/xcm/downward'
import { matchSnapshot, setupAll, testingPairs } from './helper'
import { setStorage } from '../src/utils/set-storage'

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
    blockHash: '0x663c25dc86521f4b7f74dcbc26224bb0fac40e316e6b0bcf6a51de373f37afac',
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
    await matchSnapshot(polkadot.api.query.system.events())
    await matchSnapshot(acala.api.query.system.events())

    await polkadot.teardown()
    await acala.teardown()
  })
})
