import { SubmittableResult } from '@polkadot/api'
import { describe, expect, it } from 'vitest'

import { api, defer, dev, env, expectJson, mockCallback, setupApi, testingPairs } from './helper'

setupApi(env.mandala)

describe('author rpc', () => {
  const { alice, bob } = testingPairs()

  it('works', async () => {
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

  it('failed apply extirinsic', async () => {
    const finalized = defer<void>()
    const invalid = defer<string>()

    const onStatusUpdate = (result: SubmittableResult) => {
      if (result.status.isInvalid) {
        invalid.resolve(result.status.toString())
      }
      if (result.status.isFinalized) {
        finalized.resolve(null)
      }
    }

    const { nonce } = await api.query.system.account(alice.address)
    await api.tx.balances.transfer(bob.address, 100).signAndSend(alice, { nonce }, onStatusUpdate)
    await api.tx.balances.transfer(bob.address, 200).signAndSend(alice, { nonce }, onStatusUpdate)

    await dev.newBlock()

    await finalized.promise
    expect(await invalid.promise).toBe('Invalid')
  })
})
