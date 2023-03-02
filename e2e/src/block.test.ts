import { describe, expect, it } from 'vitest'

import { chain, delay, dev, setupApi } from './helper'

setupApi({ endpoint: 'wss://rpc.polkadot.io' })

describe('block', () => {
  it('upcoming block works', async () => {
    const blockNumber = chain.head.number

    setTimeout(() => {
      dev.newBlock()
    }, 1000)
    {
      const next = await chain.upcomingBlock()
      expect(next.number).toEqual(blockNumber + 1)
    }

    setTimeout(() => {
      dev.newBlock()
    }, 1000)
    {
      const next = await chain.upcomingBlock()
      expect(next.number).toEqual(blockNumber + 2)
    }

    setTimeout(() => {
      dev.newBlock({ count: 3 })
    }, 1000)
    {
      const next = await chain.upcomingBlock({ skipCount: 2 })
      expect(next.number).toEqual(blockNumber + 5)
    }

    setTimeout(() => {
      dev.newBlock()
    }, 1000)
    {
      // no block is built within 1 sec
      await expect(chain.upcomingBlock({ timeout: 1_000 })).rejects.toThrowError('Timeout has occurred')

      const next = await chain.upcomingBlock({ timeout: 10_000 })
      expect(next.number).toEqual(blockNumber + 6)
    }

    setTimeout(() => {
      dev.newBlock()
    }, 1000)
    {
      // second block is never built
      await expect(chain.upcomingBlock({ skipCount: 1, timeout: 10_000 })).rejects.toThrowError('Timeout has occurred')
      expect(chain.head.number).toEqual(blockNumber + 7)
    }

    await delay(1000)
  })
})
