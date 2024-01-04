import { afterAll, describe, expect, it } from 'vitest'

import { delay } from './helper.js'
import networks from './networks.js'

describe('block', async () => {
  const { chain, dev, teardown } = await networks.acala()

  afterAll(async () => {
    await teardown()
  })

  it('upcoming block works', async () => {
    const promises: Promise<any>[] = []
    expect(await chain.upcomingBlocks()).toEqual(0)
    promises.push(dev.newBlock())
    await delay(20)
    expect(await chain.upcomingBlocks()).toEqual(1)

    promises.push(dev.newBlock())
    promises.push(dev.newBlock())
    await delay(20)
    expect(await chain.upcomingBlocks()).toEqual(2)

    await Promise.all(promises)
  })
})
