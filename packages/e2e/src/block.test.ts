import { afterAll, describe, expect, it } from 'vitest'

import { delay, testingPairs } from './helper.js'
import networks from './networks.js'

describe('block', async () => {
  const { chain, dev, teardown, api } = await networks.acala()

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

  it('block hash are unique', async () => {
    const { alice } = testingPairs()
    await dev.setStorage({
      System: {
        Account: [[[alice.address], { providers: 1, data: { free: 10 * 1e12 } }]],
      },
    })

    const head = chain.head
    const newBlock = await chain.newBlock()
    expect(newBlock.hash).toMatchInlineSnapshot(`"0xfca2b29b2ef3e018b87ce56dfa6200d973201222cbb67dde3aca6db905b440cc"`)

    await chain.setHead(head)
    await api.tx.system.remark('test').signAndSend(alice)
    const newBlock2 = await chain.newBlock()
    expect(newBlock2.hash).toMatchInlineSnapshot(`"0xbf570d4c473241efbc4ffe08145e074e3f22b1f40dc2fac8108912bec8ac845e"`)
  })
})
