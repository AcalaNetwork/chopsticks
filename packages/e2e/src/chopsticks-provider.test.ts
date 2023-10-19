import { ApiPromise } from '@polkadot/api'
import { ChopsticksProvider, setStorage } from '@acala-network/chopsticks-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { env, expectHex, expectJson, testingPairs } from './helper'
import networks from './networks'

const { alice, bob } = testingPairs()

describe('chopsticks provider works', async () => {
  let api: ApiPromise
  let chopsticksProvider: ChopsticksProvider

  const acala = await networks.acala({ blockNumber: 3_800_000, endpoint: env.acala.endpoint })
  const { chain } = acala

  beforeAll(async () => {
    chopsticksProvider = new ChopsticksProvider({ chain })
    api = await ApiPromise.create({
      provider: chopsticksProvider,
      signedExtensions: {
        SetEvmOrigin: {
          extrinsic: {},
          payload: {},
        },
      },
    })
    await api.isReady
    await setStorage(chopsticksProvider.chain, {
      System: {
        Account: [
          [[alice.address], { data: { free: 1 * 1e12 } }],
          [[bob.address], { data: { free: 1 * 1e12 } }],
        ],
      },
      Sudo: {
        Key: alice.address,
      },
    })
  })

  afterAll(async () => {
    await api.disconnect()
  })

  it('chain rpc', async () => {
    const hashHead = '0x0df086f32a9c3399f7fa158d3d77a1790830bd309134c5853718141c969299c7'
    const hash0 = '0xfc41b9bd8ef8fe53d58c7ea67c794c7ec9a73daf05e6d54b14ff6342c99ba64c'
    const hash1000 = '0x1d2927c6b4aca4c42cb1f88ed7fa46dc53118bb00370475aaf514ac88933e3cc'

    expectHex(await api.rpc.chain.getBlockHash()).toMatch(hashHead)
    expectHex(await api.rpc.chain.getBlockHash(0)).toMatch(hash0)
    expectHex(await api.rpc.chain.getBlockHash(1000)).toMatch(hash1000)

    expectJson(await api.rpc.chain.getHeader()).toMatchSnapshot()
    expectJson(await api.rpc.chain.getHeader(hashHead)).toMatchSnapshot()
    expectJson(await api.rpc.chain.getHeader(hash0)).toMatchSnapshot()
    expectJson(await api.rpc.chain.getHeader(hash1000)).toMatchSnapshot()

    expectJson(await api.rpc.chain.getBlock()).toMatchSnapshot()
    expectJson(await api.rpc.chain.getBlock(hashHead)).toMatchSnapshot()
    expectJson(await api.rpc.chain.getBlock(hash0)).toMatchSnapshot()
    expectJson(await api.rpc.chain.getBlock(hash1000)).toMatchSnapshot()

    expectHex(await api.rpc.chain.getFinalizedHead()).toMatch(hashHead)
  })

  it('state rpc', async () => {
    expectJson(await api.rpc.state.getRuntimeVersion()).toMatchSnapshot()
    expectHex(await api.rpc.state.getMetadata(env.acala.blockHash)).toMatchSnapshot()
    const genesisHash = await api.rpc.chain.getBlockHash(0)
    expect(await api.rpc.state.getMetadata(genesisHash)).to.not.be.eq(await api.rpc.state.getMetadata())
  })

  it('system rpc', async () => {
    expect(await api.rpc.system.chain()).toMatch('Acala')
    expect(await api.rpc.system.name()).toMatch('Subway')
    expect(await api.rpc.system.version()).toBeInstanceOf(String)
    expect(await api.rpc.system.properties()).not.toBeNull()
    expectJson(await api.rpc.system.health()).toMatchObject({
      peers: 0,
      isSyncing: false,
      shouldHavePeers: false,
    })
  })

  it('handles tx', async () => {
    await api.tx.balances.transfer(bob.address, 100).signAndSend(alice)
    await api.rpc('new_block')

    expectJson(await api.rpc.chain.getBlock()).toMatchSnapshot()
    expectJson(await api.query.system.account(alice.address)).toMatchSnapshot()
    expectJson(await api.query.system.account(bob.address)).toMatchSnapshot()
  })
})
