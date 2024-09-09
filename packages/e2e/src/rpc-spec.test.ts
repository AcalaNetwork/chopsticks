import { ApiPromise } from '@polkadot/api'
import { describe, expect, it } from 'vitest'
import { dev, env, observe, setupPolkadotApi, testingPairs } from './helper.js'

const testApi = await setupPolkadotApi(env.acalaV15)

const { alice, bob } = testingPairs()

describe('transaction_v1', async () => {
  it('sends and executes transactions', async () => {
    const chainHead = testApi.observableClient.chainHead$()

    const api = await prepareChainForTx()

    const tx = await api.tx.balances.transferKeepAlive(bob.address, 100n).signAsync(alice)
    const { nextValue, subscription } = observe(chainHead.trackTx$(tx.toHex()))
    const resultPromise = nextValue()
    const broadcast = testApi.observableClient.broadcastTx$(tx.toHex()).subscribe()

    // We don't have a confirmation of when the transaction has been broadcasted through the network
    // it just continues to get broadcasted through the nodes until we unsubscribe from it.
    // In this case, where there's only one node, waiting for 300ms should be enough.
    await new Promise((resolve) => setTimeout(resolve, 300))
    const hash = await dev.newBlock()

    expect(await resultPromise).toMatchObject({
      hash,
      found: {
        type: true,
      },
    })

    broadcast.unsubscribe()
    subscription.unsubscribe()
    chainHead.unfollow()
  })
})

const UPGRADED = 0x80000000_00000000_00000000_00000000n
const INITIAL_ACCOUNT_VALUE = 100_000_000_000_000n
async function prepareChainForTx() {
  const api = await ApiPromise.create({
    provider: testApi.ws,
    noInitWarn: true,
  })
  await api.isReady
  await dev.setStorage({
    System: {
      Account: [
        [
          [alice.address],
          {
            data: { free: INITIAL_ACCOUNT_VALUE, flags: UPGRADED },
          },
        ],
        [[bob.address], { data: { free: INITIAL_ACCOUNT_VALUE, flags: UPGRADED } }],
      ],
    },
    Sudo: {
      Key: alice.address,
    },
  })

  return api
}
