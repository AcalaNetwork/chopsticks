import { describe, expect, it } from 'vitest'

import { chain, dev, setupApi } from './helper'

setupApi({ endpoint: 'wss://rpc.polkadot.io' })

describe('block', () => {
  it('upcoming block works', async () => {
    expect(await chain.upcomingBlocks()).toEqual(0)
    dev.newBlock()
    expect(await chain.upcomingBlocks()).toEqual(1)

    dev.newBlock()
    dev.newBlock()

    expect(await chain.upcomingBlocks()).toEqual(2)
  })
})
