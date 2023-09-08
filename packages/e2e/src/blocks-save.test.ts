import { assert, describe, expect, it } from 'vitest'
import { resolve } from 'node:path'
import { tmpdir } from 'node:os'
import networks from './networks'

describe('block-save', async () => {
  let savedBlockHash: string

  it('saved blocks data', async () => {
    const acala = await networks.acala({ db: resolve(tmpdir(), 'testdb.sqlite') })
    const { chain, dev } = acala
    const blockNumber = chain.head.number

    await dev.newBlock({ count: 2 })
    expect(chain.head.number).eq(blockNumber + 2)
    const numberOfBlocks = await chain.db!.getRepository('Block').count()
    expect(numberOfBlocks).toEqual(2)

    const block = await chain.getBlockAt(chain.head.number)
    const blockData = await chain.db!.getRepository('Block').findOne({ where: { number: chain.head.number } })
    assert(block && blockData, 'block and blockData should be defined')
    expect(blockData.hash).toEqual(block.hash)
    expect(JSON.stringify(blockData.header)).toEqual(JSON.stringify(block.header))
    expect(blockData.parentHash).toEqual((await block.parentBlock)!.hash)
    expect(JSON.stringify(blockData.extrinsics)).toEqual(JSON.stringify(await block.extrinsics))
    expect(JSON.stringify(blockData.storageDiff)).toEqual(JSON.stringify(await block.storageDiff()))

    savedBlockHash = block.hash

    await acala.teardown()
  })

  it('load chain from the saved blocks', async () => {
    const acala = await networks.acala({ db: resolve(tmpdir(), 'testdb.sqlite'), resume: true })
    const { chain } = acala
    const head = await chain.getBlockAt(chain.head.number)

    expect(head?.hash).toEqual(savedBlockHash)

    await acala.teardown()
  })
})
