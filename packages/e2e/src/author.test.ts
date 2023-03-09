import { SubmittableResult } from '@polkadot/api'
import { afterAll, describe, expect, it } from 'vitest'

import { defer, expectJson, mockCallback, testingPairs } from './helper'
import networks from './networks'

describe('author rpc', async () => {
  const { alice, bob } = testingPairs()
  const acala = await networks.acala()
  const { api, dev } = acala

  await acala.dev.setStorage({
    System: {
      Account: [
        [[alice.address], { data: { free: 10 * 1e12 } }],
        [[bob.address], { data: { free: 10 * 1e12 } }],
      ],
    },
    Sudo: {
      Key: alice.address,
    },
  })

  afterAll(async () => {
    await acala.teardown()
  })

  it('works', async () => {
    {
      const { callback, next } = mockCallback()
      await api.tx.balances.transfer(bob.address, 100).signAndSend(alice, callback)
      await dev.newBlock()

      await next()

      expect(callback.mock.calls).toMatchSnapshot()
      callback.mockClear()

      expectJson(await api.rpc.chain.getBlock()).toMatchSnapshot()
      expectJson(await api.query.system.account(alice.address)).toMatchSnapshot()
      expectJson(await api.query.system.account(bob.address)).toMatchSnapshot()
    }

    {
      const { callback, next } = mockCallback()
      await api.tx.balances.transfer(bob.address, 200).signAndSend(alice, callback)
      await dev.newBlock()

      await next()

      expect(callback.mock.calls).toMatchSnapshot()
      callback.mockClear()

      expectJson(await api.rpc.chain.getBlock()).toMatchSnapshot()
      expectJson(await api.query.system.account(alice.address)).toMatchSnapshot()
      expectJson(await api.query.system.account(bob.address)).toMatchSnapshot()
    }

    {
      const { callback, next } = mockCallback()
      await api.tx.balances.transfer(bob.address, 300).signAndSend(alice, callback)
      await dev.newBlock()

      await next()

      expect(callback.mock.calls).toMatchSnapshot()
      callback.mockClear()

      expectJson(await api.rpc.chain.getBlock()).toMatchSnapshot()
      expectJson(await api.query.system.account(alice.address)).toMatchSnapshot()
      expectJson(await api.query.system.account(bob.address)).toMatchSnapshot()
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
        finalized.resolve()
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
