import { describe, expect, it } from 'vitest'

import { api, dev, env, expectJson, mockCallback, setupApi, testingPairs } from './helper'

setupApi(env.mandala)

describe('author rpc', () => {
  it('works', async () => {
    const { alice, bob } = testingPairs()

    {
      const { callback, next } = mockCallback()
      await api.tx.balances.transfer(bob.address, 100).signAndSend(alice, callback)
      await dev.newBlock()

      await next()

      expect(callback.mock.calls).toMatchSnapshot()
      callback.mockClear()

      await expectJson(api.rpc.chain.getBlock()).toMatchSnapshot()
      await expectJson(api.query.system.account(alice.address)).toMatchSnapshot()
      await expectJson(api.query.system.account(bob.address)).toMatchSnapshot()
    }

    {
      const { callback, next } = mockCallback()
      await api.tx.balances.transfer(bob.address, 200).signAndSend(alice, callback)
      await dev.newBlock()

      await next()

      expect(callback.mock.calls).toMatchSnapshot()
      callback.mockClear()

      await expectJson(api.rpc.chain.getBlock()).toMatchSnapshot()
      await expectJson(api.query.system.account(alice.address)).toMatchSnapshot()
      await expectJson(api.query.system.account(bob.address)).toMatchSnapshot()
    }

    {
      const { callback, next } = mockCallback()
      await api.tx.balances.transfer(bob.address, 300).signAndSend(alice, callback)
      await dev.newBlock()

      await next()

      expect(callback.mock.calls).toMatchSnapshot()
      callback.mockClear()

      await expectJson(api.rpc.chain.getBlock()).toMatchSnapshot()
      await expectJson(api.query.system.account(alice.address)).toMatchSnapshot()
      await expectJson(api.query.system.account(bob.address)).toMatchSnapshot()
    }
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
})
