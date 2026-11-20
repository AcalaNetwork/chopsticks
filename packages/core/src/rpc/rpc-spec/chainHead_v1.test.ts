import type { HexString } from '@polkadot/util/types'
import { assert, describe, expect, it, vi } from 'vitest'
import { Block } from '../../blockchain/block.js'
import type { Context } from '../shared.js'
import {
  chainHead_v1_body,
  chainHead_v1_continue,
  chainHead_v1_follow,
  chainHead_v1_storage,
  type StorageItemRequest,
} from './chainHead_v1.js'
import { PAGE_SIZE } from './storage-common.js'

const runtime = (overrides: Partial<Record<'implVersion' | 'specVersion', number>> = {}) => ({
  specName: 'test-chain',
  implName: 'test-impl',
  authoringVersion: 1,
  specVersion: overrides.specVersion ?? 2,
  implVersion: overrides.implVersion ?? 3,
  apis: [
    ['0x0102030405060708' as HexString, 1],
    ['0x1112131415161718' as HexString, 2],
  ] as [HexString, number][],
  transactionVersion: 4,
  stateVersion: 1,
})

const setup = (headRuntime: Promise<ReturnType<typeof runtime>>) => {
  let update: ((block: any) => Promise<void>) | undefined
  const callback = vi.fn()
  const context = {
    chain: {
      getBlock: vi.fn(),
      head: { hash: '0xhead', runtimeVersion: headRuntime },
      headState: {
        subscribeHead: vi.fn((next: (block: any) => Promise<void>) => {
          update = next
          return 'follow-id'
        }),
        unsubscribeHead: vi.fn(),
      },
    },
  }
  const subscriptions = {
    subscribe: vi.fn(() => callback),
    unsubscribe: vi.fn(),
  }

  return { callback, context, subscriptions, getUpdate: () => update }
}

describe('chainHead_v1_follow runtime events', () => {
  it('reports valid runtime specifications for initialized and newBlock events', async () => {
    const { callback, context, subscriptions, getUpdate } = setup(Promise.resolve(runtime()))

    await chainHead_v1_follow(context as any, [true], subscriptions)
    await new Promise((resolve) => setTimeout(resolve, 0))

    const update = getUpdate()
    expect(update).toBeDefined()
    await update?.({
      hash: '0xblock',
      runtimeVersion: Promise.resolve(runtime({ specVersion: 3 })),
      parentBlock: Promise.resolve({ runtimeVersion: Promise.resolve(runtime()) }),
    })

    expect(callback).toHaveBeenNthCalledWith(1, {
      event: 'initialized',
      finalizedBlockHashes: ['0xhead'],
      finalizedBlockRuntime: {
        type: 'valid',
        spec: {
          specName: 'test-chain',
          implName: 'test-impl',
          specVersion: 2,
          implVersion: 3,
          transactionVersion: 4,
          apis: {
            '0x0102030405060708': 1,
            '0x1112131415161718': 2,
          },
        },
      },
    })
    expect(callback).toHaveBeenNthCalledWith(3, {
      event: 'newBlock',
      blockHash: '0xblock',
      parentBlockHash: undefined,
      newRuntime: {
        type: 'valid',
        spec: {
          specName: 'test-chain',
          implName: 'test-impl',
          specVersion: 3,
          implVersion: 3,
          transactionVersion: 4,
          apis: {
            '0x0102030405060708': 1,
            '0x1112131415161718': 2,
          },
        },
      },
    })
  })

  it('reports invalid runtime specifications when runtime loading fails', async () => {
    const error = new Error('runtime unavailable')
    const failedRuntime = Promise.reject(error)
    failedRuntime.catch(() => {})
    const { callback, context, subscriptions, getUpdate } = setup(failedRuntime)

    await chainHead_v1_follow(context as any, [true], subscriptions)
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(callback).toHaveBeenCalledWith({
      event: 'initialized',
      finalizedBlockHashes: ['0xhead'],
      finalizedBlockRuntime: { type: 'invalid', error: 'runtime unavailable' },
    })

    await getUpdate()?.({
      hash: '0xblock',
      runtimeVersion: Promise.reject(error),
      parentBlock: Promise.resolve({ runtimeVersion: Promise.resolve(runtime()) }),
    })

    expect(callback).toHaveBeenNthCalledWith(3, {
      event: 'newBlock',
      blockHash: '0xblock',
      parentBlockHash: undefined,
      newRuntime: { type: 'invalid', error: 'runtime unavailable' },
    })
  })
})

describe('chainHead_v1 operation failures', () => {
  const hash = '0xhead'
  const key = '0x1234'

  const follow = async () => {
    const { callback, context, subscriptions } = setup(Promise.resolve(runtime()))
    const rpcContext = context as unknown as Context
    const subscription = await chainHead_v1_follow(rpcContext, [false], subscriptions)
    await vi.waitFor(() =>
      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ event: 'bestBlockChanged' })),
    )
    callback.mockClear()
    return { callback, getBlock: context.chain.getBlock, rpcContext, subscription, subscriptions }
  }

  it('finishes a failed storage read and accepts a new read after recovery', async () => {
    const { callback, getBlock, rpcContext, subscription, subscriptions } = await follow()
    const otherKey = '0x5678'
    const pendingRead = Promise.withResolvers<HexString>()
    const get = vi
      .fn()
      .mockRejectedValueOnce(new Error('upstream disconnected'))
      .mockReturnValueOnce(pendingRead.promise)
      .mockResolvedValue('0xab')
    getBlock.mockResolvedValue({ get })
    const read = (items: StorageItemRequest[]) =>
      chainHead_v1_storage(rpcContext, [subscription, hash, items, null], subscriptions)

    const { operationId } = await read([
      { key, type: 'value' },
      { key: otherKey, type: 'value' },
    ])
    expect(callback).not.toHaveBeenCalled()
    await vi.waitFor(() => expect(get).toHaveBeenCalledTimes(2))
    pendingRead.resolve('0xcd')
    await vi.waitFor(() =>
      expect(callback.mock.calls).toEqual([
        [{ event: 'operationStorageItems', operationId, items: [{ key: otherKey, value: '0xcd' }] }],
        [{ event: 'operationInaccessible', operationId }],
      ]),
    )

    callback.mockClear()
    const recovered = await read([{ key, type: 'value' }])
    await vi.waitFor(() =>
      expect(callback.mock.calls).toEqual([
        [{ event: 'operationStorageItems', operationId: recovered.operationId, items: [{ key, value: '0xab' }] }],
        [{ event: 'operationStorageDone', operationId: recovered.operationId }],
      ]),
    )
  })

  it('clears a failed continuation and rejects concurrent attempts to resume the same page', async () => {
    const { callback, getBlock, rpcContext, subscription, subscriptions } = await follow()
    const keys = Array.from({ length: PAGE_SIZE }, (_, i) => `${key}${i.toString(16).padStart(4, '0')}`)
    const getKeysPaged = vi.fn().mockResolvedValueOnce(keys).mockRejectedValueOnce(new Error('upstream disconnected'))
    getBlock.mockResolvedValue({
      getKeysPaged,
      getMany: vi.fn().mockResolvedValue(keys.map(() => '0xab')),
    })

    const { operationId } = await chainHead_v1_storage(
      rpcContext,
      [subscription, hash, [{ key, type: 'descendantsValues' }], null],
      subscriptions,
    )
    await vi.waitFor(() =>
      expect(callback).toHaveBeenLastCalledWith({ event: 'operationWaitingForContinue', operationId }),
    )
    callback.mockClear()

    const resume = () => chainHead_v1_continue(rpcContext, [subscription, operationId], subscriptions)
    await expect(resume()).resolves.toBeNull()
    await expect(resume()).rejects.toMatchObject({ code: -32803 })
    await vi.waitFor(() =>
      expect(callback).toHaveBeenCalledExactlyOnceWith({ event: 'operationInaccessible', operationId }),
    )
    await expect(resume()).rejects.toMatchObject({ code: -32803 })
    expect(getKeysPaged).toHaveBeenCalledTimes(2)
  })

  it('retries an upstream body fetch for the same block after recovery', async () => {
    const { callback, getBlock, rpcContext, subscription, subscriptions } = await follow()
    const extrinsics = ['0xab']
    const fetchBlock = vi
      .fn()
      .mockRejectedValueOnce(new Error('upstream disconnected'))
      .mockResolvedValue({ block: { extrinsics } })
    const chain = { api: { getBlock: fetchBlock } } as unknown as Context['chain']
    getBlock.mockResolvedValue(new Block(chain, 1, hash))
    const readBody = () => chainHead_v1_body(rpcContext, [subscription, hash], subscriptions)

    const started = await readBody()
    assert(started.result === 'started')
    await vi.waitFor(() =>
      expect(callback).toHaveBeenLastCalledWith({
        event: 'operationInaccessible',
        operationId: started.operationId,
      }),
    )

    const recovered = await readBody()
    assert(recovered.result === 'started')
    await vi.waitFor(() =>
      expect(callback).toHaveBeenLastCalledWith({
        event: 'operationBodyDone',
        operationId: recovered.operationId,
        value: extrinsics,
      }),
    )
  })
})
