import { describe, expect, it } from 'vitest'

import { api, dev, env, expectJson, setupApi, testingPairs } from './helper'

setupApi(env.mandala)

describe('system rpc', () => {
  it('works', async () => {
    expect(await api.rpc.system.chain()).toMatch('Acala Mandala TC8')
    expect(await api.rpc.system.name()).toMatch('Acala Node')
    expect(await api.rpc.system.version()).toBeInstanceOf(String)
    expect(await api.rpc.system.properties()).not.toBeNull()
    await expectJson(api.rpc.system.health()).toMatchObject({
      peers: 0,
      isSyncing: false,
      shouldHavePeers: false,
    })
  })

  it('get correct account next index', async () => {
    const { alice } = testingPairs()

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
