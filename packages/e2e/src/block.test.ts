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
    expect(newBlock.hash).toMatchInlineSnapshot(`"0xb20b7e701f6a6e9e700a8f81849d59241f7ae51e08260491292f34bc9d06b2ba"`)

    await chain.setHead(head)
    await api.tx.system.remark('test').signAndSend(alice)
    const newBlock2 = await chain.newBlock()
    expect(newBlock2.hash).toMatchInlineSnapshot(`"0x9f8ec5d13ff39c5ab53fd8dc3bf2ce3f65bf5ddf86865eb8e9fea904c0bff45d"`)
  })
})
