import { assert, describe, expect, it } from 'vitest'
import { resolve } from 'node:path'
import { tmpdir } from 'node:os'
import networks from './networks'

describe('block-save', async () => {
  const buildBlocks = async () => {
    // save blocks
    const acala = await networks.acala({ db: resolve(tmpdir(), 'db.sqlite') })
    const { chain, dev } = acala
    await dev.newBlock({ count: 2 })
    const head = await chain.getBlockAt(chain.head.number)
    const savedHeadHash = head?.hash
    await acala.teardown()

    return savedHeadHash
  }

  it('saved blocks data', async () => {
    const acala = await networks.acala({ db: resolve(tmpdir(), 'db.sqlite') })
    const { chain, dev } = acala
    await dev.newBlock({ count: 2 })

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

    await acala.teardown()
  })

  it('load chain using the latest saved block', async () => {
    const savedHeadHash = await buildBlocks()

    // load block
    const newAcala = await networks.acala({ db: resolve(tmpdir(), 'db.sqlite'), resume: true })
    const newHeadNumber = newAcala.chain.head.number
    const loadedHead = await newAcala.chain.getBlockAt(newHeadNumber)

    expect(loadedHead?.hash).toEqual(savedHeadHash)
    await newAcala.teardown()
  })

  it('load chain using a block number', async () => {
    await buildBlocks()

    // load blocks
    const newAcala = await networks.acala({ db: resolve(tmpdir(), 'db.sqlite'), resume: 3000001 })
    const newHeadNumber = newAcala.chain.head.number

    expect(newHeadNumber).toEqual(3000001)
    await newAcala.teardown()
  })

  it('load chain using a block hash', async () => {
    const savedHeadHash = await buildBlocks()

    // load blocks
    const newAcala = await networks.acala({ db: resolve(tmpdir(), 'db.sqlite'), resume: savedHeadHash })
    const newHeadNumber = newAcala.chain.head.number
    const loadedHead = await newAcala.chain.getBlockAt(newHeadNumber)

    expect(loadedHead?.hash).toEqual(savedHeadHash)
    await newAcala.teardown()
  })
})
