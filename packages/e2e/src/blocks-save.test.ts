import { afterAll, describe, expect, it } from 'vitest'

import networks from './networks'

describe('block-save', async () => {
  const acala = await networks.acala({ db: 'db.sqlite' })
  const { chain, dev } = acala

  afterAll(async () => {
    await acala.teardown()
  })

  it('saved blocks data', async () => {
    await dev.newBlock({ count: 2 })

    const numberOfBlocks = await chain.db?.getRepository('Block').count()
    expect(numberOfBlocks).toEqual(3)

    const block = await chain.getBlockAt(chain.head.number)
    const blockData = await chain.db?.getRepository('Block').findOne({ where: { number: chain.head.number } })
    expect(blockData?.hash).toEqual(block?.hash)
    expect(JSON.stringify(blockData?.header)).toEqual(JSON.stringify(block?.header))
    expect(blockData?.parentHash).toEqual((await block?.parentBlock)?.hash)
    expect(JSON.stringify(blockData?.extrinsics)).toEqual(JSON.stringify(await block?.extrinsics))
    expect(JSON.stringify(blockData?.storageDiff)).toEqual(JSON.stringify(await block?.storageDiff()))
  })
})
