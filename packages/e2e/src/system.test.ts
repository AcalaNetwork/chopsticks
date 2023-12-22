import { describe, expect, it } from 'vitest'

import { api, check, dev, env, setupApi, testingPairs } from './helper.js'

setupApi(env.acala)

describe('system rpc', () => {
  const { alice } = testingPairs()

  it('works', async () => {
    expect(await api.rpc.system.chain()).toMatch('Acala')
    expect(await api.rpc.system.name()).toMatch('Subway')
    expect(await api.rpc.system.version()).toBeInstanceOf(String)
    expect(await api.rpc.system.properties()).not.toBeNull()
    await check(api.rpc.system.health()).toMatchObject({
      peers: 0,
      isSyncing: false,
      shouldHavePeers: false,
    })
  })

  it('zero is not replaced with null', async () => {
    expect(await api.rpc('system_accountNextIndex', alice.address)).toBe(0)
  })

  it('get correct account next index', async () => {
    await dev.setStorage({
      System: {
        Account: [[[alice.address], { providers: 1, data: { free: 10 * 1e12 } }]],
      },
    })

    const nonce = async (address: string) => (await api.query.system.account(address)).nonce.toNumber()

    const accountNextIndex = async (address: string) => (await api.rpc.system.accountNextIndex(address)).toNumber()

    // send tx
    await api.tx.balances.transfer(alice.address, 0).signAndSend(alice)

    expect(await nonce(alice.address)).toBe(0)
    expect(await accountNextIndex(alice.address)).toBe(1)

    await dev.newBlock()

    expect(await nonce(alice.address)).toBe(1)
    expect(await accountNextIndex(alice.address)).toBe(1)

    // send another tx
    await api.tx.balances.transfer(alice.address, 0).signAndSend(alice)

    expect(await nonce(alice.address)).toBe(1)
    expect(await accountNextIndex(alice.address)).toBe(2)
  })
})
