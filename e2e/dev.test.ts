import { describe, expect, it } from 'vitest'
import { u8aToHex } from '@polkadot/util'

import { api, dev, env, expectJson, setupApi, testingPairs } from './helper'

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
})
