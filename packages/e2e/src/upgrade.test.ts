import { readFileSync } from 'node:fs'
import path from 'node:path'
import { hexToU8a } from '@polkadot/util'
import { afterAll, describe, expect, it } from 'vitest'
import { check, setupContext, testingPairs } from './helper.js'

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
    await dev.newBlock({ count: 2 })
    expect(await chain.head.runtimeVersion).toEqual(expect.objectContaining({ specVersion: 2101 }))
    await new Promise((r) => setTimeout(r, 1000)) // give some time for api to detect runtime change
    expect(api.runtimeVersion.specVersion).toMatchInlineSnapshot(`2101`)

    await api.tx.balances.transfer(bob.address, 1e12).signAndSend(alice)
    await dev.newBlock()
    await check(api.query.system.account(bob.address)).toMatchSnapshot()

    await api.tx.balances.transfer(bob.address, 1e12).signAndSend(alice)
    await dev.newBlock()
    await check(api.query.system.account(bob.address)).toMatchSnapshot()
  })
})

describe('upgrade new validation data', async () => {
  const { alith } = testingPairs()
  const { api, dev, chain, teardown } = await setupContext({
    endpoint: 'wss://wss.api.moonbase.moonbeam.network',
    blockNumber: 15521300,
    db: !process.env.RUN_TESTS_WITHOUT_DB ? 'e2e-tests-db.sqlite' : undefined,
  })

  afterAll(async () => {
    await teardown()
  })
  it('upgrade to validation data', async () => {
    await dev.setStorage({})

    const runtime = readFileSync(path.join(__dirname, '../blobs/moonbase-runtime-4300.txt')).toString().trim()
    const codeHash = api.registry.hash(hexToU8a(runtime))
    await dev.setStorage({
      System: {
        Account: [[[alith.address], { providers: 1, data: { free: '0xff0000000000000000' } }]],
        AuthorizedUpgrade: {
          code_hash: codeHash,
          check_version: false,
        },
      },
    })

    await api.tx.system.applyAuthorizedUpgrade(runtime).signAndSend(alith)
    await dev.newBlock({ count: 2 })

    expect(await chain.head.runtimeVersion).toEqual(expect.objectContaining({ specVersion: 4300 }))

    const number = chain.head.number
    await dev.newBlock({ count: 3 })
    expect(chain.head.number).toEqual(number + 3)
  })
})
