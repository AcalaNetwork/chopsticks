import { expect, it, vi } from 'vitest'
import type { Context, SubscriptionManager } from '../shared.js'
import { archive_v1_storage } from './archive_v1.js'

it('ends the archive storage subscription when an upstream read fails', async () => {
  const callback = vi.fn()
  const subscriptions = {
    subscribe: vi.fn<SubscriptionManager['subscribe']>(() => callback),
    unsubscribe: vi.fn(),
  }
  const get = vi.fn().mockRejectedValue(new Error('upstream disconnected'))
  const context = { chain: { getBlock: vi.fn().mockResolvedValue({ get }) } } as unknown as Context

  const operationId = await archive_v1_storage(
    context,
    ['0x1234', [{ key: '0xab', type: 'value' }], null],
    subscriptions,
  )
  expect(callback).not.toHaveBeenCalled()
  await vi.waitFor(() => {
    expect(callback).toHaveBeenCalledExactlyOnceWith({
      event: 'storageError',
      operationId,
      error: 'upstream disconnected',
    })
    expect(subscriptions.unsubscribe).toHaveBeenCalledExactlyOnceWith(operationId)
  })
})
