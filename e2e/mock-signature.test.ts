import { describe, expect, it } from 'vitest'

import { api, env, setupApi, testingPairs } from './helper'

setupApi({
  ...env.mandala,
  mockSignatureHost: true,
})

describe('mock signature', () => {
  it('accept valid signature', async () => {
    const { alice, bob } = testingPairs()
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

    await expect(tx.send()).rejects.toThrow('Extrinsic is invalid')
  })

  it('accept mock signature', async () => {
    const { alice, bob } = testingPairs()
    const { nonce } = await api.query.system.account(alice.address)
    const tx = api.tx.balances.transfer(bob.address, 100)

    tx.signFake(alice.address, {
      nonce,
      genesisHash: api.genesisHash,
      runtimeVersion: api.runtimeVersion,
      blockHash: api.genesisHash,
    })

    const mockSignature = new Uint8Array(64)
    mockSignature.fill(0xcd)
    mockSignature.set([0xde, 0xad, 0xbe, 0xef])
    tx.signature.set(mockSignature)

    await expect(tx.send()).resolves.toBeTruthy()
  })
})
