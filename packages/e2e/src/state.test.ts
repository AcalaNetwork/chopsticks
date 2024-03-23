import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { api, check, checkHex, env, mockCallback, setupApi, testingPairs } from './helper.js'
import networks from './networks.js'

setupApi(env.acala)

describe('state rpc', () => {
  it('getXXX', async () => {
    await check(api.rpc.state.getRuntimeVersion()).toMatchSnapshot()
    await checkHex(api.rpc.state.getMetadata(env.acala.blockHash)).toMatchSnapshot()
    const genesisHash = await api.rpc.chain.getBlockHash(0)
    expect(await api.rpc.state.getMetadata(genesisHash)).to.not.be.eq(await api.rpc.state.getMetadata())
  })

  it('subscribeRuntimeVersion', async () => {
    const { api, dev, teardown } = await networks.acala({
      blockNumber: 2000000,
    })

    const { alice } = testingPairs()

    await dev.setStorage({
      Sudo: {
        Key: alice.address,
      },
      System: {
        Account: [[[alice.address], { data: { free: 1000 * 1e12 } }]],
      },
    })

    const { callback, next } = mockCallback()

    const currentVersion = next()
    const unsub = await api.rpc.state.subscribeRuntimeVersion((version) => callback(version.toHuman()))
    expect(await currentVersion).toMatchInlineSnapshot(`
      [
        {
          "apis": [
            [
              "0xdf6acb689907609b",
              "4",
            ],
            [
              "0x37e397fc7c91f5e4",
              "1",
            ],
            [
              "0x40fe3ad401f8959a",
              "6",
            ],
            [
              "0xd2bc9897eed08f15",
              "3",
            ],
            [
              "0xf78b278be53f454c",
              "2",
            ],
            [
              "0xdd718d5cc53262d4",
              "1",
            ],
            [
              "0xab3c0572291feb8b",
              "1",
            ],
            [
              "0xbc9d89904f5b923f",
              "1",
            ],
            [
              "0x37c8bb1350a9a2a8",
              "1",
            ],
            [
              "0x6ef953004ba30e59",
              "1",
            ],
            [
              "0x955e168e0cfb3409",
              "1",
            ],
            [
              "0xe3df3f2aa8a5cc57",
              "2",
            ],
            [
              "0xea93e3f16f3d6962",
              "2",
            ],
          ],
          "authoringVersion": "1",
          "implName": "acala",
          "implVersion": "0",
          "specName": "acala",
          "specVersion": "2,096",
          "stateVersion": "0",
          "transactionVersion": "1",
        },
      ]
    `)

    const newVersion = next()

    const runtime = readFileSync(path.join(__dirname, '../blobs/acala-runtime-2101.txt')).toString().trim()
    await api.tx.sudo.sudoUncheckedWeight(api.tx.system.setCode(runtime), '0').signAndSend(alice)
    await dev.newBlock({ count: 3 })

    expect(await newVersion).toMatchInlineSnapshot(`
      [
        {
          "apis": [
            [
              "0xdf6acb689907609b",
              "4",
            ],
            [
              "0x37e397fc7c91f5e4",
              "1",
            ],
            [
              "0x40fe3ad401f8959a",
              "6",
            ],
            [
              "0xd2bc9897eed08f15",
              "3",
            ],
            [
              "0xf78b278be53f454c",
              "2",
            ],
            [
              "0xdd718d5cc53262d4",
              "1",
            ],
            [
              "0xab3c0572291feb8b",
              "1",
            ],
            [
              "0xbc9d89904f5b923f",
              "1",
            ],
            [
              "0x37c8bb1350a9a2a8",
              "1",
            ],
            [
              "0x6ef953004ba30e59",
              "1",
            ],
            [
              "0x955e168e0cfb3409",
              "1",
            ],
            [
              "0xe3df3f2aa8a5cc57",
              "2",
            ],
            [
              "0xea93e3f16f3d6962",
              "2",
            ],
          ],
          "authoringVersion": "1",
          "implName": "acala",
          "implVersion": "0",
          "specName": "acala",
          "specVersion": "2,101",
          "stateVersion": "0",
          "transactionVersion": "1",
        },
      ]
    `)

    unsub()

    await teardown()
  })
})
