import { blake2AsHex } from '@polkadot/util-crypto'
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { api, chain, dev, expectJson, setupApi, testingPairs } from './helper'

setupApi({
  endpoint: 'wss://acala-rpc-1.aca-api.network',
  blockHash: '0x663c25dc86521f4b7f74dcbc26224bb0fac40e316e6b0bcf6a51de373f37afac',
})

describe('upgrade', () => {
  const { alice, bob } = testingPairs()
  it('setCode works', async () => {
    await dev.setStorages({
      Sudo: {
        Key: alice.address,
      },
      System: {
        Account: [[[alice.address], { data: { free: 1000 * 1e12 } }]],
      },
    })

    const runtime = String(readFileSync(path.join(__dirname, './blobs/acala-runtime-2101.txt'))).trim()

    expect(await chain.head.runtimeVersion).toContain({ specVersion: 2096 })
    await api.tx.sudo.sudo(api.tx.parachainSystem.authorizeUpgrade(blake2AsHex(runtime))).signAndSend(alice)
    await dev.newBlock()
    await api.tx.sudo.sudoUncheckedWeight(api.tx.system.setCode(runtime), '0').signAndSend(alice)
    await dev.newBlock()
    await dev.newBlock()
    expect(await chain.head.runtimeVersion).toContain({ specVersion: 2101 })

    await api.tx.balances.transfer(bob.address, 1e12).signAndSend(alice)
    await dev.newBlock()
    await expectJson(api.query.system.account(bob.address)).toMatchSnapshot()

    await api.tx.balances.transfer(bob.address, 1e12).signAndSend(alice)
    await dev.newBlock()
    await expectJson(api.query.system.account(bob.address)).toMatchSnapshot()
  })
})
