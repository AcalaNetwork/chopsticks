import { createTestPairs } from '@polkadot/keyring/testingPairs'
import { describe, expect, it } from 'vitest'

import { api, dev, expectJson, mockCallback } from './helper'

describe('author rpc', () => {
  it('works', async () => {
    const testPairs = createTestPairs({ type: 'sr25519' })

    {
      const { callback, next } = mockCallback()
      await api.tx.balances.transfer(testPairs.bob.address, 100).signAndSend(testPairs.alice, callback)
      await dev.newBlock()

      await next()

      expect(callback.mock.calls).toMatchSnapshot()
      callback.mockClear()

      await expectJson(api.rpc.chain.getBlock()).toMatchSnapshot()
      await expectJson(api.query.system.account(testPairs.alice.address)).toMatchSnapshot()
      await expectJson(api.query.system.account(testPairs.bob.address)).toMatchSnapshot()
    }

    {
      const { callback, next } = mockCallback()
      await api.tx.balances.transfer(testPairs.bob.address, 200).signAndSend(testPairs.alice, callback)
      await dev.newBlock()

      await next()

      expect(callback.mock.calls).toMatchSnapshot()
      callback.mockClear()

      await expectJson(api.rpc.chain.getBlock()).toMatchSnapshot()
      await expectJson(api.query.system.account(testPairs.alice.address)).toMatchSnapshot()
      await expectJson(api.query.system.account(testPairs.bob.address)).toMatchSnapshot()
    }

    {
      const { callback, next } = mockCallback()
      await api.tx.balances.transfer(testPairs.bob.address, 300).signAndSend(testPairs.alice, callback)
      await dev.newBlock()

      await next()

      expect(callback.mock.calls).toMatchSnapshot()
      callback.mockClear()

      await expectJson(api.rpc.chain.getBlock()).toMatchSnapshot()
      await expectJson(api.query.system.account(testPairs.alice.address)).toMatchSnapshot()
      await expectJson(api.query.system.account(testPairs.bob.address)).toMatchSnapshot()
    }
  })
})
