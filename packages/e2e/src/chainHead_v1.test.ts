import { Binary } from '@polkadot-api/substrate-bindings'
import { describe, expect, it, vi } from 'vitest'
import type { FollowEventWithRuntime, StorageItemResponse } from '@polkadot-api/substrate-client'

import { api, asyncSpy, dev, env, setupApi, substrateClient } from './helper.js'

setupApi(env.acala)

describe('chainHead_v1 rpc', () => {
  it('reports the chain state', async () => {
    const onEvent = asyncSpy<[FollowEventWithRuntime], []>()
    const onError = vi.fn()
    const follower = substrateClient.chainHead(true, onEvent, onError)

    const initialized = await onEvent.nextCall()
    expect(initialized).toMatchSnapshot()

    const blockHash = await dev.newBlock()

    const [[newBlock], [bestBlock], [finalized]] = onEvent.mock.calls.slice(1)

    expect(newBlock).toEqual({
      type: 'newBlock',
      blockHash,
      parentBlockHash: {},
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

    expect(onError).not.toHaveBeenCalled()
    follower.unfollow()
  })

  it('resolves storage queries', async () => {
    const onEvent = asyncSpy<[FollowEventWithRuntime], []>()
    const onError = vi.fn()
    const follower = substrateClient.chainHead(true, onEvent, onError)

    const initialized = await onEvent.nextCall()
    const initializedHash = (initialized.type === 'initialized' && initialized.finalizedBlockHashes[0]) || ''

    const key = Binary.fromBytes(
      api.query.system.account.creator('5F98oWfz2r5rcRVnP9VCndg33DAAsky3iuoBSpaPUbgN9AJn').slice(2),
    ).asHex()

    // An empty value resolves to null
    expect(await follower.storage(initializedHash, 'value', key, null)).toEqual(null)

    // With an existing value it returns the SCALE-encoded value.
    const hash = '0xfc41b9bd8ef8fe53d58c7ea67c794c7ec9a73daf05e6d54b14ff6342c99ba64c'
    expect(await follower.storage(hash, 'value', key, null)).toMatchSnapshot()

    expect(onError).not.toHaveBeenCalled()
    follower.unfollow()
  })

  it('resolves partial key storage queries', async () => {
    const onEvent = asyncSpy<[FollowEventWithRuntime], []>()
    const onError = vi.fn()
    const follower = substrateClient.chainHead(true, onEvent, onError)

    const initialized = await onEvent.nextCall()
    const initializedHash = (initialized.type === 'initialized' && initialized.finalizedBlockHashes[0]) || ''

    const key = Binary.fromBytes(api.query.tokens.totalIssuance.creator.iterKey!()).asHex()

    // An empty value resolves to null
    let receivedItems: StorageItemResponse[] = []
    const onDone = asyncSpy()
    const onDiscardedItems = vi.fn()
    follower.storageSubscription(
      initializedHash,
      [
        {
          key,
          type: 'descendantsValues',
        },
      ],
      null,
      (items) => (receivedItems = [...receivedItems, ...items]),
      onError,
      onDone,
      onDiscardedItems,
    )
    await onDone.nextCall()

    expect(onDiscardedItems).toHaveBeenCalledWith(0)
    expect(receivedItems.length).toEqual(23)

    expect(onError).not.toHaveBeenCalled()
    follower.unfollow()
  })

  it('resolves the header for a specific block', async () => {
    const onEvent = asyncSpy<[FollowEventWithRuntime], []>()
    const onError = vi.fn()
    const follower = substrateClient.chainHead(true, onEvent, onError)

    const initialized = await onEvent.nextCall()
    const hash = (initialized.type === 'initialized' && initialized.finalizedBlockHashes[0]) || ''

    expect(await follower.header(hash)).toMatchSnapshot()

    expect(onError).not.toHaveBeenCalled()
    follower.unfollow()
  })

  it('runs runtime calls', async () => {
    const onEvent = asyncSpy<[FollowEventWithRuntime], []>()
    const onError = vi.fn()
    const follower = substrateClient.chainHead(true, onEvent, onError)

    const initialized = await onEvent.nextCall()
    const hash = (initialized.type === 'initialized' && initialized.finalizedBlockHashes[0]) || ''

    expect(await follower.call(hash, 'Core_version', '')).toMatchSnapshot()

    await expect(follower.call(hash, 'bruh', '')).rejects.toThrow('Function to start was not found')

    expect(onError).not.toHaveBeenCalled()
    follower.unfollow()
  })

  it('retrieves the body for a specific block', async () => {
    const onEvent = asyncSpy<[FollowEventWithRuntime], []>()
    const onError = vi.fn()
    const follower = substrateClient.chainHead(true, onEvent, onError)

    const initialized = await onEvent.nextCall()
    const hash = (initialized.type === 'initialized' && initialized.finalizedBlockHashes[0]) || ''

    expect(await follower.body(hash)).toMatchSnapshot()

    expect(onError).not.toHaveBeenCalled()
    follower.unfollow()
  })
})
