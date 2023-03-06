import { describe, expect, it } from 'vitest'

import { chain, delay, dev, setupApi } from './helper'

describe('block', () => {
  setupApi({ endpoint: 'wss://rpc.polkadot.io' })

  it('upcoming block works', async () => {
    expect(await chain.upcomingBlocks()).toEqual(0)
    dev.newBlock()
    await delay(10)
    expect(await chain.upcomingBlocks()).toEqual(1)

    dev.newBlock()
    dev.newBlock()
    await delay(10)
    expect(await chain.upcomingBlocks()).toEqual(2)
  })
})
