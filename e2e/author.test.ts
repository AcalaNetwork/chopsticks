import { Keyring } from '@polkadot/keyring'
import { describe, expect, it } from 'vitest'

import { api, dev, expectJson, mockCallback } from './helper'

describe('author rpc', () => {
  it('works', async () => {
    const keyring = new Keyring({ type: 'ed25519' }) // cannot use sr25519 as it is non determinstic
    const alice = keyring.addFromUri('//Alice')
    const bob = keyring.addFromUri('//Bob')

    console.log(alice.address, bob.address)
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
})
