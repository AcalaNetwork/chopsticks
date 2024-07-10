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
    expect(newBlock.hash).toMatchInlineSnapshot(`"0x7baf31315697b9ec18e8edc1474d94d3345e3893ef28d3dca465fd1018d09d69"`)

    await chain.setHead(head)
    await api.tx.system.remark('test').signAndSend(alice)
    const newBlock2 = await chain.newBlock()
    expect(newBlock2.hash).toMatchInlineSnapshot(`"0x06bc2f59ed2888d22bef8ce433bd2072c2e0de7cb42b4c2c8c8f96f73c407d2c"`)
  })
})
