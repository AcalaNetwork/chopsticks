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
      const next = await chain.upcomingBlock(2)
      expect(next.number).toEqual(blockNumber + 5)
    }

    await delay(1000)
  })
})
