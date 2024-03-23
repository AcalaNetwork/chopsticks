import { resolve } from 'node:path'
import { tmpdir } from 'node:os'

import { assert, describe, expect, it } from 'vitest'
import { connectUpward } from '@acala-network/chopsticks-core/xcm/upward.js'
import { setStorage } from '@acala-network/chopsticks'

import { check, checkSystemEvents, testingPairs } from './helper.js'
import networks from './networks.js'

describe('resume', async () => {
  const buildBlocksAndTeardown = async (network = 'acala', dbName = 'db.sqlite') => {
    const blockchain = await networks[network]({ db: resolve(tmpdir(), dbName) })
    const { chain, dev } = blockchain
    await dev.newBlock({ count: 2 })
    const head = await chain.getBlockAt(chain.head.number)
    const savedHeadHash = head?.hash
    await blockchain.teardown()

    return savedHeadHash
  }

  it('save blocks data', async () => {
    const { chain, dev, teardown } = await networks.acala({ db: resolve(tmpdir(), 'db.sqlite') })
    if (!chain.db) {
      throw new Error('chain.db should be defined')
    }
    await dev.newBlock({ count: 2 })

    const numberOfBlocks = await chain.db.blocksCount()
    expect(numberOfBlocks).toEqual(2)

    const block = await chain.getBlockAt(chain.head.number)
    const blockData = await chain.db.queryBlockByNumber(chain.head.number)

    assert(block && blockData, 'block and blockData should be defined')
    expect(blockData.hash).toEqual(block.hash)
    expect(blockData.header).toEqual((await block.header).toHex())
    expect(blockData.parentHash).toEqual((await block.parentBlock)!.hash)
    expect(JSON.stringify(blockData.extrinsics)).toEqual(JSON.stringify(await block.extrinsics))
    expect(JSON.stringify(blockData.storageDiff)).toEqual(JSON.stringify(await block.storageDiff()))

    await teardown()
  })

  it('resume with the latest saved block', async () => {
    const savedHeadHash = await buildBlocksAndTeardown()

    // load block
    const newAcala = await networks.acala({ db: resolve(tmpdir(), 'db.sqlite'), resume: true })
    const newHeadNumber = newAcala.chain.head.number
    const loadedHead = await newAcala.chain.getBlockAt(newHeadNumber)

    expect(loadedHead?.hash).toEqual(savedHeadHash)
    // fixes api runtime disconnect warning
    await new Promise((r) => setTimeout(r, 50))
    await newAcala.teardown()
  })

  it('resume with a block number', async () => {
    await buildBlocksAndTeardown()

    // load blocks
    const newAcala = await networks.acala({ db: resolve(tmpdir(), 'db.sqlite'), resume: 3000001 })
    const newHeadNumber = newAcala.chain.head.number

    expect(newHeadNumber).toEqual(3000001)
    // fixes api runtime disconnect warning
    await new Promise((r) => setTimeout(r, 50))
    await newAcala.teardown()
  })

  it('resume with a block hash', async () => {
    const savedHeadHash = await buildBlocksAndTeardown()

    // load blocks
    const newAcala = await networks.acala({ db: resolve(tmpdir(), 'db.sqlite'), resume: savedHeadHash })
    const newHeadNumber = newAcala.chain.head.number
    const loadedHead = await newAcala.chain.getBlockAt(newHeadNumber)

    expect(loadedHead?.hash).toEqual(savedHeadHash)
    // fixes api runtime disconnect warning
    await new Promise((r) => setTimeout(r, 50))
    await newAcala.teardown()
  })

  describe('resume with multi network', async () => {
    it('resume with Acala and Polkadot works', async () => {
      const savedAcalaHash = await buildBlocksAndTeardown('acala', 'db.acala.sqlite')
      const savedPolkadotHash = await buildBlocksAndTeardown('polkadot', 'db.polkadot.sqlite')

      // resume
      const acala = await networks.acala({ db: resolve(tmpdir(), 'db.acala.sqlite'), resume: savedAcalaHash })
      const polkadot = await networks.polkadot({
        db: resolve(tmpdir(), 'db.polkadot.sqlite'),
        resume: savedPolkadotHash,
      })

      const loadedAcalaHead = acala.chain.head
      const loadedPolkadotHead = polkadot.chain.head

      expect(loadedAcalaHead.hash).toEqual(savedAcalaHash)
      expect(loadedPolkadotHead.hash).toEqual(savedPolkadotHash)

      // fixes api runtime disconnect warning
      await new Promise((r) => setTimeout(r, 50))

      await acala.teardown()
      await polkadot.teardown()
    })

    it('resume and xcm works', async () => {
      const savedAcalaHash = await buildBlocksAndTeardown('acala', 'db.acala.sqlite')
      const savedPolkadotHash = await buildBlocksAndTeardown('polkadot', 'db.polkadot.sqlite')

      // resume
      const acala = await networks.acala({ db: resolve(tmpdir(), 'db.acala.sqlite'), resume: savedAcalaHash })
      const polkadot = await networks.polkadot({
        db: resolve(tmpdir(), 'db.polkadot.sqlite'),
        resume: savedPolkadotHash,
      })

      // test ump
      await connectUpward(acala.chain, polkadot.chain)
      const { alice } = testingPairs()
      await setStorage(acala.chain, {
        System: {
          Account: [[[alice.address], { data: { free: 1000 * 1e10 } }]],
        },
        Tokens: {
          Accounts: [[[alice.address, { token: 'DOT' }], { free: 1000e10 }]],
        },
      })

      await check(polkadot.api.query.system.account(alice.address)).toMatchSnapshot()
      await check(acala.api.query.system.account(alice.address)).toMatchSnapshot()
      await check(acala.api.query.tokens.accounts(alice.address, { token: 'DOT' })).toMatchSnapshot()

      await acala.api.tx.xTokens
        .transfer(
          {
            Token: 'DOT',
          },
          10e10,
          {
            V1: {
              parents: 1,
              interior: {
                X1: {
                  AccountId32: {
                    network: 'Any',
                    id: alice.addressRaw,
                  },
                },
              },
            },
          },
          {
            Unlimited: null,
          },
        )
        .signAndSend(alice)

      await acala.chain.newBlock()
      await checkSystemEvents(acala).toMatchSnapshot()
      await check(acala.api.query.tokens.accounts(alice.address, { token: 'DOT' })).toMatchSnapshot()

      await polkadot.chain.newBlock()

      await check(polkadot.api.query.system.account(alice.address)).toMatchSnapshot()
      await checkSystemEvents(polkadot).toMatchSnapshot()

      await acala.teardown()
      await polkadot.teardown()
    })
  })
})
