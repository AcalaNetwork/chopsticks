import { describe, expect, it } from 'vitest'
import { u8aToHex } from '@polkadot/util'

import { api, dev, env, expectJson, setupApi, testingPairs, ws } from './helper'

setupApi(env.mandala)

describe('dev rpc', () => {
  it('setStorages', async () => {
    const { alice, test1 } = testingPairs()

    await expectJson(api.query.sudo.key()).toMatchSnapshot()

    await dev.setStorages([[api.query.sudo.key.key(), u8aToHex(alice.addressRaw)]])

    await expectJson(api.query.sudo.key()).toMatchSnapshot()

    await api.tx.sudo.sudo(api.tx.balances.setBalance(test1.address, 1000000000000, 0)).signAndSend(alice)
    const hash = await dev.newBlock()

    await expectJson(api.query.system.account(test1.address)).toMatchSnapshot()

    await dev.setStorages([[api.query.system.account.key(test1.address), null]], hash)

    await expectJson(api.query.system.account(test1.address)).toMatchSnapshot()

    await dev.setStorages({
      System: {
        Account: [[[test1.address], { data: { free: 100000 }, nonce: 1 }]],
      },
    })

    await expectJson(api.query.system.account(test1.address)).toMatchSnapshot()
  })

  it('setStorages handle errors', async () => {
    await expect(
      dev.setStorages({
        SSystem: { Account: [] },
      })
    ).rejects.toThrowError('1: Error: Cannot find pallet SSystem')

    await expect(
      dev.setStorages({
        System: { AAccount: [] },
      })
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

  it('dryRun', async () => {
    const params = [
      {
        raw: false,
        hrmp: {
          '2034': [
            {
              send_at: 13740000,
              data: '0x000210000400000106540254a37a01cd75b616d63e0ab665bffdb0143c52ae0013000064a7b3b6e00d0a1300000106540254a37a01cd75b616d63e0ab665bffdb0143c52ae0013000064a7b3b6e00d010700f2052a010d010004000101008eaf04151687736326c9fea17e25fc5287613693c912909cb226aa4794f26a48',
            },
          ],
        },
      },
    ]
    const resp = await ws.send('dev_dryRun', params)
    expect(resp.delta).toMatchSnapshot()
  })

  it('setHead', async () => {
    const blockNumber = (await api.rpc.chain.getHeader()).number.toNumber()
    const hash = (await api.rpc.chain.getBlockHash()).toHex()
    const newHash = await dev.newBlock({ count: 3 })
    await dev.setHead(hash)
    expect(await api.rpc.chain.getBlockHash()).toBe(hash)
    await dev.setHead(blockNumber + 3)
    expect(await api.rpc.chain.getBlockHash()).toBe(newHash)
    await dev.setHead(-3)
    expect(await api.rpc.chain.getBlockHash()).toBe(hash)
  })
})
