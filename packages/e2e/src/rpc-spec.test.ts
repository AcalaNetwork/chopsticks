import type { RuntimeContext } from '@polkadot-api/observable-client'
import { ApiPromise } from '@polkadot/api'
import { firstValueFrom } from 'rxjs'
import { describe, expect, it } from 'vitest'
import { dev, env, observe, setupPolkadotApi, testingPairs } from './helper.js'

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
    await new Promise((onSuccess, onError) =>
      testApi.substrateClient._request('transaction_v1_broadcast', [tx.toHex()], { onSuccess, onError }),
    )
    const hash = await dev.newBlock()

    expect(await resultPromise).toMatchObject({
      hash,
      found: {
        type: true,
      },
    })

    const keyEncoder = (addr: string) => (ctx: RuntimeContext) =>
      ctx.dynamicBuilder.buildStorage('System', 'Account').keys.enc(addr)
    const resultDecoder = (data: string | null, ctx: RuntimeContext) =>
      data ? ctx.dynamicBuilder.buildStorage('System', 'Account').value.dec(data) : null
    expect(
      await firstValueFrom(chainHead.storage$(null, 'value', keyEncoder(bob.address), null, resultDecoder)),
    ).toMatchObject({
      mapped: {
        data: {
          free: INITIAL_ACCOUNT_VALUE + TRANSFERRED_VALUE,
        },
      },
    })

    subscription.unsubscribe()
    chainHead.unfollow()
  })
})

describe('chainSpec_v1', () => {
  it('retrieves the chainSpec data', async () => {
    expect(await testApi.substrateClient.getChainSpecData()).toMatchSnapshot()
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
