import type { HexString } from '@polkadot/util/types'
import { describe, expect, it, vi } from 'vitest'
import { chainHead_v1_follow } from './chainHead_v1.js'

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
