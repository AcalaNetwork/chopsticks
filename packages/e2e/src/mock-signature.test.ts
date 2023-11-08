import { describe, expect, it } from 'vitest'
import { signFake, signFakeWithApi } from '@acala-network/chopsticks-testing'

import { api, dev, env, setupApi, testingPairs } from './helper.js'

setupApi({
  ...env.acala,
  mockSignatureHost: true,
  allowUnresolvedImports: false,
})

describe('mock signature', () => {
  it('accept valid signature', async () => {
    const { alice, bob } = testingPairs()
    await dev.setStorage({
      System: {
        Account: [[[alice.address], { providers: 1, data: { free: 1000 * 1e12 } }]],
      },
    })

    const tx = api.tx.balances.transfer(bob.address, 100)

    await tx.signAsync(alice)

    await expect(tx.send()).resolves.toBeTruthy()
  })

  it('reject invalid signature', async () => {
    const { alice, bob } = testingPairs()
    const { nonce } = await api.query.system.account(alice.address)
    const tx = api.tx.balances.transfer(bob.address, 100)

    tx.signFake(alice.address, {
      nonce,
      genesisHash: api.genesisHash,
      runtimeVersion: api.runtimeVersion,
      blockHash: api.genesisHash,
    })

    await expect(tx.send()).rejects.toThrow('1010: {"invalid":{"badProof":null}}')
  })

  it('accept mock signature (with api)', async () => {
    const { alice, bob } = testingPairs()
    await dev.setStorage({
      System: {
        Account: [[[alice.address], { providers: 1, data: { free: 1000 * 1e12 } }]],
      },
    })

    const tx = api.tx.balances.transfer(bob.address, 100)

    await signFakeWithApi(api, tx, alice.address)

    await expect(tx.send()).resolves.toBeTruthy()
  })

  it('accept mock signature (manually input options)', async () => {
    const { alice, bob } = testingPairs()
    await dev.setStorage({
      System: {
        Account: [[[alice.address], { providers: 1, data: { free: 1000 * 1e12 } }]],
      },
    })

    const { nonce } = await api.query.system.account(alice.address)
    const tx = api.tx.balances.transfer(bob.address, 100)

    signFake(tx, alice.address, {
      nonce,
      genesisHash: api.genesisHash,
      runtimeVersion: api.runtimeVersion,
      blockHash: api.genesisHash,
    })

    await expect(tx.send()).resolves.toBeTruthy()
  })
})
