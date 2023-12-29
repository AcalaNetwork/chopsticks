import { afterAll, describe, expect, it } from 'vitest'
import { u8aToHex } from '@polkadot/util'

import { check, testingPairs } from './helper.js'
import networks from './networks.js'

describe('dev rpc', async () => {
  const { alice, bob } = testingPairs()

  const { api, chain, dev, ws, teardown } = await networks.acala()

  await dev.setStorage({
    System: {
      Account: [[[alice.address], { data: { free: 10 * 1e12 } }]],
    },
    Sudo: {
      Key: alice.address,
    },
  })

  afterAll(async () => {
    await teardown()
  })

  it('setStorage', async () => {
    await check(api.query.sudo.key()).toMatchSnapshot()

    await dev.setStorage([[api.query.sudo.key.key(), u8aToHex(alice.addressRaw)]])

    await check(api.query.sudo.key()).toMatchSnapshot()

    await api.tx.sudo.sudo(api.tx.balances.setBalance(bob.address, 1000000000000, 0)).signAndSend(alice)
    const hash = await dev.newBlock()

    await check(api.query.system.account(bob.address)).toMatchSnapshot()

    await dev.setStorage([[api.query.system.account.key(bob.address), null]], hash)

    await check(api.query.system.account(bob.address)).toMatchSnapshot()

    await dev.setStorage({
      System: {
        Account: [[[bob.address], { data: { free: 100000 }, nonce: 1 }]],
      },
    })

    await check(api.query.system.account(bob.address)).toMatchSnapshot()
  })

  it('setStorage handle errors', async () => {
    await expect(
      dev.setStorage({
        SSystem: { Account: [] },
      }),
    ).rejects.toThrowError('1: Error: Cannot find pallet SSystem')

    await expect(
      dev.setStorage({
        System: { AAccount: [] },
      }),
    ).rejects.toThrowError('1: Error: Cannot find storage AAccount in pallet System')
  })

  it('newBlock', async () => {
    const blockNumber = (await api.rpc.chain.getHeader()).number.toNumber()
    const hash = await dev.newBlock({ count: 3 })
    const newBlockNumber = (await api.rpc.chain.getHeader(hash)).number.toNumber()
    expect(newBlockNumber).toBe(blockNumber + 3)

    await dev.newBlock({ to: blockNumber + 5 })
    const newBlockNumber2 = (await api.rpc.chain.getHeader()).number.toNumber()
    expect(newBlockNumber2).toBe(blockNumber + 5)
  })

  it('timeTravel', async () => {
    const date = 'Jan 1, 2023'
    const timestamp = await dev.timeTravel(date)
    expect(timestamp).eq(Date.parse(date))
  })

  it('dryRun hrmp', async () => {
    const params = [
      {
        raw: false,
        hrmp: {
          2034: [
            {
              sentAt: 13740000,
              data: '0x000210000400000106540254a37a01cd75b616d63e0ab665bffdb0143c52ae0013000064a7b3b6e00d0a1300000106540254a37a01cd75b616d63e0ab665bffdb0143c52ae0013000064a7b3b6e00d010700f2052a010d010004000101008eaf04151687736326c9fea17e25fc5287613693c912909cb226aa4794f26a48',
            },
          ],
        },
      },
    ]
    const resp = await ws.send('dev_dryRun', params)
    expect(resp.new.system.events).toMatchSnapshot()
  })

  it('setHead', async () => {
    const blockNumber = chain.head.number
    const hash = chain.head.hash
    await dev.newBlock({ count: 3 })
    await dev.setHead(hash)
    expect((await api.rpc.chain.getBlockHash()).toHex()).toBe(hash)
    await dev.setHead(blockNumber - 3)
    expect((await api.rpc.chain.getBlockHash()).toHex()).toMatchInlineSnapshot(
      '"0xfab81f03d3275189a7dc02b0e4fabfab3916ff9a729ba3ec6ad84e029f0a74e7"',
    )
    await dev.setHead(-3)
    expect((await api.rpc.chain.getBlockHash()).toHex()).toMatchInlineSnapshot(
      '"0xb5297d01adb0964d5195f9f17a3cf6e99ef8622e71863456eeb9296d5681292b"',
    )
  })
})
