import type { RuntimeContext } from '@polkadot-api/observable-client'
import { describe, expect, it } from 'vitest'

import { getPolkadotSigner } from 'polkadot-api/signer'
import { firstValueFrom } from 'rxjs'
import { dev, env, observe, setupPolkadotApi, testingPairs } from './helper.js'

import { Binary } from 'polkadot-api'

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
      ctx.dynamicBuilder.buildStorage('System', 'Account').keys.enc(addr)
    const emptyAccount = await firstValueFrom(
      chainHead.storage$(null, 'value', keyEncoder('5F98oWfz2r5rcRVnP9VCndg33DAAsky3iuoBSpaPUbgN9AJn')),
    )

    // An empty value resolves to null
    expect(emptyAccount).toEqual(null)

    // With an existing value it returns the SCALE-encoded value.
    const resultDecoder = (data: string | null, ctx: RuntimeContext) =>
      data ? ctx.dynamicBuilder.buildStorage('System', 'Account').value.dec(data) : null
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
        ctx.dynamicBuilder.buildStorage('Tokens', 'TotalIssuance').keys.enc(),
      ),
    )

    expect(receivedItems.length).toEqual(26)

    chainHead.unfollow()
  })

  it('runs through multiple pages of storage queries', async () => {
    const chainHead = testApi.observableClient.chainHead$()

    const receivedItems = await firstValueFrom(
      chainHead.storage$(null, 'descendantsValues', (ctx) =>
        ctx.dynamicBuilder.buildStorage('System', 'BlockHash').keys.enc(),
      ),
    )

    expect(receivedItems.length).toEqual(1201)

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

  it('changes the closestDescendantMerkleValue when the storage changes for that key', async () => {
    const chainHead = testApi.observableClient.chainHead$()
    const runtimeCtx = await firstValueFrom(chainHead.getRuntimeContext$(null))

    const { alice, bob, charlie } = testingPairs()
    await dev.setStorage({
      System: {
        Account: [
          [[alice.address], { providers: 1, data: { free: 10 * 1e12 } }],
          [[bob.address], { providers: 1, data: { free: 10 * 1e12 } }],
        ],
      },
    })

    const balancesKeyBuilder = runtimeCtx.dynamicBuilder.buildStorage('System', 'Account').keys
    const aliceBalanceKey = balancesKeyBuilder.enc(alice.address)
    const bobBalanceKey = balancesKeyBuilder.enc(bob.address)
    const commonPrefix = findCommonPrefix([aliceBalanceKey, bobBalanceKey])

    const [aliceMerkleValue, bobMerkleValue, commonMerkleValue] = await Promise.all(
      [aliceBalanceKey, bobBalanceKey, commonPrefix].map((key) =>
        firstValueFrom(chainHead.storage$(null, 'closestDescendantMerkleValue', () => key)),
      ),
    )

    const extrinsic = await testApi.client
      .getUnsafeApi()
      .tx.Balances.transfer_keep_alive({
        dest: {
          type: 'Id',
          value: charlie.address,
        },
        value: 1_000_000_000n,
      })
      .sign(getPolkadotSigner(alice.publicKey, 'Ed25519', alice.sign))

    await testApi.chain.newBlock({
      transactions: [extrinsic as `0x${string}`],
    })

    const [newAliceMerkleValue, newBobMerkleValue, newCommonMerkleValue] = await Promise.all(
      [aliceBalanceKey, bobBalanceKey, commonPrefix].map((key) =>
        firstValueFrom(chainHead.storage$(null, 'closestDescendantMerkleValue', () => key)),
      ),
    )

    // Alice has transfered some funds, their value must change
    expect(newAliceMerkleValue).not.toEqual(aliceMerkleValue)
    // Bob shouldn't have any change
    expect(newBobMerkleValue).toEqual(bobMerkleValue)
    // The common prefix should also reflect a change
    expect(newCommonMerkleValue).not.toEqual(commonMerkleValue)

    chainHead.unfollow()
  })

  it('supports watching entries of a storage entry', async () => {
    const { nextValue } = observe(testApi.client.getUnsafeApi().query.Multisig.Multisigs.watchEntries())
    // Wait for initial set of entries
    await nextValue()

    const { alice, bob } = testingPairs()
    await dev.setStorage({
      System: {
        Account: [
          [[alice.address], { providers: 1, data: { free: 10 * 1e12 } }],
          [[bob.address], { providers: 1, data: { free: 10 * 1e12 } }],
        ],
      },
    })

    const aliceSigner = getPolkadotSigner(alice.publicKey, 'Ed25519', alice.sign)

    const callHash = Binary.fromBytes(new Uint8Array(32))
    const extrinsic = await testApi.client
      .getUnsafeApi()
      .tx.Multisig.approve_as_multi({
        threshold: 2,
        other_signatories: [bob.address],
        call_hash: callHash,
        max_weight: {
          proof_size: 1000n,
          ref_time: 1000n,
        },
        maybe_timepoint: undefined,
      })
      .sign(aliceSigner)

    // Watch out for new entries
    let entries = nextValue()

    await testApi.chain.newBlock({
      transactions: [extrinsic as `0x${string}`],
    })

    let { deltas } = await entries

    expect(deltas?.deleted).toEqual([])
    expect(deltas?.upserted.length).toEqual(1)
    expect(deltas?.upserted[0].args[1].asHex()).toEqual(callHash.asHex())

    // Test deletion
    const timepoint = deltas!.upserted[0].value.when
    const cancelExtrinsic = await testApi.client
      .getUnsafeApi()
      .tx.Multisig.cancel_as_multi({
        threshold: 2,
        other_signatories: [bob.address],
        call_hash: callHash,
        timepoint,
      })
      .sign(aliceSigner)

    entries = nextValue()
    await testApi.chain.newBlock({
      transactions: [cancelExtrinsic as `0x${string}`],
    })
    deltas = (await entries).deltas

    expect(deltas?.deleted.length).toEqual(1)
    expect(deltas?.upserted.length).toEqual(0)
    expect(deltas?.deleted[0].args[1].asHex()).toEqual(callHash.asHex())
  })
})

function findCommonPrefix(strings: string[]) {
  if (!strings.length) return ''

  const [first, ...rest] = strings

  for (let i = 1; i < first.length; i++) {
    const prefix = first.slice(0, i)
    if (rest.some((s) => !s.startsWith(prefix))) {
      return first.slice(0, i - 1)
    }
  }
  return first
}
