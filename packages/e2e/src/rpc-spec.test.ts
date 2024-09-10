import { ApiPromise } from '@polkadot/api'
import { RuntimeContext } from '@polkadot-api/observable-client'
import { describe, expect, it } from 'vitest'
import { dev, env, observe, setupPolkadotApi, testingPairs } from './helper.js'
import { firstValueFrom } from 'rxjs'

const testApi = await setupPolkadotApi(env.acalaV15)

const { alice, bob } = testingPairs()

describe('transaction_v1', async () => {
  it('sends and executes transactions', async () => {
    const chainHead = testApi.observableClient.chainHead$()

    const api = await prepareChainForTx()

    const TRANSFERRED_VALUE = 100n
    const tx = await api.tx.balances.transferKeepAlive(bob.address, TRANSFERRED_VALUE).signAsync(alice)
    const { nextValue, subscription } = observe(chainHead.trackTx$(tx.toHex()))
    const resultPromise = nextValue()
    const broadcast = testApi.observableClient.broadcastTx$(tx.toHex()).subscribe()

    // We don't have a confirmation of when the transaction has been broadcasted through the network
    // it just continues to get broadcasted through the nodes until we unsubscribe from it.
    // In this case, where there's only one node, waiting for 500ms should be enough.
    await new Promise((resolve) => setTimeout(resolve, 500))
    const hash = await dev.newBlock()

    expect(await resultPromise).toMatchObject({
      hash,
      found: {
        type: true,
      },
    })

    const keyEncoder = (addr: string) => (ctx: RuntimeContext) =>
      ctx.dynamicBuilder.buildStorage('System', 'Account').enc(addr)
    const resultDecoder = (data: string | null, ctx: RuntimeContext) =>
      data ? ctx.dynamicBuilder.buildStorage('System', 'Account').dec(data) : null
    expect(
      await firstValueFrom(chainHead.storage$(null, 'value', keyEncoder(bob.address), null, resultDecoder)),
    ).toMatchObject({
      data: {
        free: INITIAL_ACCOUNT_VALUE + TRANSFERRED_VALUE,
      },
    })

    broadcast.unsubscribe()
    subscription.unsubscribe()
    chainHead.unfollow()
  })
})

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
            providers: 1,
            data: { free: INITIAL_ACCOUNT_VALUE },
          },
        ],
        [
          [bob.address],
          {
            providers: 1,
            data: { free: INITIAL_ACCOUNT_VALUE },
          },
        ],
      ],
    },
    Sudo: {
      Key: alice.address,
    },
  })

  return api
}
