import { RuntimeContext } from '@polkadot-api/observable-client'
import { describe, expect, it } from 'vitest'

import { dev, env, observe, setupPolkadotApi } from './helper.js'
import { firstValueFrom } from 'rxjs'

const testApi = await setupPolkadotApi(env.acalaV15)

describe('chainHead_v1 rpc', () => {
  it('reports the chain state', async () => {
    const chainHead = testApi.observableClient.chainHead$()
    const { next, error, subscription, nextValue } = observe(chainHead.follow$)

    const initialized = await nextValue()
    expect(initialized).toMatchSnapshot()

    const blockHash = await dev.newBlock()

    const [[newBlock], [bestBlock], [finalized]] = next.mock.calls.slice(1)

    expect(newBlock).toEqual({
      type: 'newBlock',
      blockHash,
      parentBlockHash: '0x6c74912ce35793b05980f924c3a4cdf1f96c66b2bedd0c7b7378571e60918145',
      newRuntime: null,
    })
    expect(bestBlock).toEqual({
      type: 'bestBlockChanged',
      bestBlockHash: blockHash,
    })
    expect(finalized).toEqual({
      type: 'finalized',
      finalizedBlockHashes: [blockHash],
      prunedBlockHashes: [],
    })

    expect(error).not.toHaveBeenCalled()
    subscription.unsubscribe()
    chainHead.unfollow()
  })

  it('resolves storage queries', async () => {
    const chainHead = testApi.observableClient.chainHead$()

    const keyEncoder = (addr: string) => (ctx: RuntimeContext) =>
      ctx.dynamicBuilder.buildStorage('System', 'Account').enc(addr)
    const emptyAccount = await firstValueFrom(
      chainHead.storage$(null, 'value', keyEncoder('5F98oWfz2r5rcRVnP9VCndg33DAAsky3iuoBSpaPUbgN9AJn')),
    )

    // An empty value resolves to null
    expect(emptyAccount).toEqual(null)

    // With an existing value it returns the SCALE-encoded value.
    const resultDecoder = (data: string | null, ctx: RuntimeContext) =>
      data ? ctx.dynamicBuilder.buildStorage('System', 'Account').dec(data) : null
    const account = await firstValueFrom(
      chainHead.storage$(
        null,
        'value',
        keyEncoder('2636WSLQhSLPAb4rd7qPgCpSKEjAz6FAbHYPAex6phJLNBfH'),
        null,
        resultDecoder,
      ),
    )
    expect(account).toMatchSnapshot()

    chainHead.unfollow()
  })

  it('resolves partial key storage queries', async () => {
    const chainHead = testApi.observableClient.chainHead$()

    const receivedItems = await firstValueFrom(
      chainHead.storage$(null, 'descendantsValues', (ctx) =>
        ctx.dynamicBuilder.buildStorage('Tokens', 'TotalIssuance').enc(),
      ),
    )

    expect(receivedItems.length).toEqual(26)

    chainHead.unfollow()
  })

  it('resolves the header for a specific block', async () => {
    const chainHead = testApi.observableClient.chainHead$()

    const header = await firstValueFrom(chainHead.header$(null))

    expect(header).toMatchSnapshot()

    chainHead.unfollow()
  })

  it('runs runtime calls', async () => {
    const chainHead = testApi.observableClient.chainHead$()

    const result = await firstValueFrom(chainHead.call$(null, 'Core_version', ''))

    expect(result).toMatchSnapshot()

    const nonExisting = firstValueFrom(chainHead.call$(null, 'bruh', ''))

    await expect(nonExisting).rejects.toThrow('Function to start was not found')

    chainHead.unfollow()
  })

  it('retrieves the body for a specific block', async () => {
    const chainHead = testApi.observableClient.chainHead$()

    const { hash } = await firstValueFrom(chainHead.finalized$)
    const result = await firstValueFrom(chainHead.body$(hash))

    expect(result).toMatchSnapshot()

    chainHead.unfollow()
  })
})
