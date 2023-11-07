import { afterAll, describe, expect, it } from 'vitest'
import networks from './networks.js'

describe('max-memory-block-count', async () => {
  const acala = await networks.acala({ maxMemoryBlockCount: 2 })
  const { chain } = acala

  afterAll(async () => {
    await acala.teardown()
  })

  it('removes the oldest block when exceed', async () => {
    // ensure the first block is registered
    const firstBlock = await chain.getBlockAt(chain.head.number)
    await acala.dev.newBlock({ count: 2 })
    const blocksInMemory = chain.blocksInMemory()
    expect(blocksInMemory[0].number).toEqual((firstBlock?.number || 0) + 1)
    expect(blocksInMemory.length).toEqual(2)
  })
})
