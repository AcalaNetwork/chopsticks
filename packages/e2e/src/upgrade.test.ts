import { afterAll, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { check, testingPairs } from './helper.js'

import networks from './networks.js'

describe('upgrade', async () => {
  const { alice, bob } = testingPairs()
  const { api, dev, chain, teardown } = await networks.acala({
    blockNumber: 2000000,
  })

  afterAll(async () => {
    await teardown()
  })

  it('setCode works', async () => {
    await dev.setStorage({
      Sudo: {
        Key: alice.address,
      },
      System: {
        Account: [[[alice.address], { data: { free: 1000 * 1e12 } }]],
      },
    })

    const runtime = readFileSync(path.join(__dirname, '../blobs/acala-runtime-2101.txt')).toString().trim()

    expect(await chain.head.runtimeVersion).toEqual(expect.objectContaining({ specVersion: 2096 }))
    await api.tx.sudo.sudoUncheckedWeight(api.tx.system.setCode(runtime), '0').signAndSend(alice)
    await dev.newBlock({ count: 3 })
    expect(await chain.head.runtimeVersion).toEqual(expect.objectContaining({ specVersion: 2101 }))
    expect(api.runtimeVersion.specVersion).toMatchInlineSnapshot(`2101`)

    await api.tx.balances.transfer(bob.address, 1e12).signAndSend(alice)
    await dev.newBlock()
    await check(api.query.system.account(bob.address)).toMatchSnapshot()

    await api.tx.balances.transfer(bob.address, 1e12).signAndSend(alice)
    await dev.newBlock()
    await check(api.query.system.account(bob.address)).toMatchSnapshot()
  })
})
