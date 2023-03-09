import { afterAll, describe, expect, it } from 'vitest'

import { delay } from './helper'
import networks from './networks'

describe('block', async () => {
  const acala = await networks.acala()
  const { chain, dev } = acala

  afterAll(async () => {
    await acala.teardown()
  })

  it('upcoming block works', async () => {
    const promises: Promise<any>[] = []
    expect(await chain.upcomingBlocks()).toEqual(0)
    promises.push(dev.newBlock())
    await delay(10)
    expect(await chain.upcomingBlocks()).toEqual(1)

    promises.push(dev.newBlock())
    promises.push(dev.newBlock())
    await delay(10)
    expect(await chain.upcomingBlocks()).toEqual(2)

    await Promise.all(promises)
  })
})
