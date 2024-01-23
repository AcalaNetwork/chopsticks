import { ApiPromise } from '@polkadot/api'
import { BuildBlockMode, ChopsticksProvider, setStorage } from '@acala-network/chopsticks-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { check, checkHex, env, testingPairs } from './helper.js'
import networks from './networks.js'

const { alice, bob } = testingPairs()

describe('chopsticks provider works', async () => {
  const { chain, teardown } = await networks.acala({ blockNumber: 3_800_000, endpoint: env.acala.endpoint })

  const chopsticksProvider = new ChopsticksProvider(chain)
  const api = await ApiPromise.create({
    provider: chopsticksProvider,
    noInitWarn: true,
  })

  beforeAll(async () => {
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
    await teardown()
  })

  it('chain rpc', async () => {
    const hashHead = '0x0df086f32a9c3399f7fa158d3d77a1790830bd309134c5853718141c969299c7'
    const hash0 = '0xfc41b9bd8ef8fe53d58c7ea67c794c7ec9a73daf05e6d54b14ff6342c99ba64c'
    const hash1000 = '0x1d2927c6b4aca4c42cb1f88ed7fa46dc53118bb00370475aaf514ac88933e3cc'

    await checkHex(api.rpc.chain.getBlockHash()).toMatch(hashHead)
    await checkHex(api.rpc.chain.getBlockHash(0)).toMatch(hash0)
    await checkHex(api.rpc.chain.getBlockHash(1000)).toMatch(hash1000)

    await check(api.rpc.chain.getHeader()).toMatchSnapshot()
    await check(api.rpc.chain.getHeader(hashHead)).toMatchSnapshot()
    await check(api.rpc.chain.getHeader(hash0)).toMatchSnapshot()
    await check(api.rpc.chain.getHeader(hash1000)).toMatchSnapshot()

    await check(api.rpc.chain.getBlock()).toMatchSnapshot()
    await check(api.rpc.chain.getBlock(hashHead)).toMatchSnapshot()
    await check(api.rpc.chain.getBlock(hash0)).toMatchSnapshot()
    await check(api.rpc.chain.getBlock(hash1000)).toMatchSnapshot()

    await checkHex(api.rpc.chain.getFinalizedHead()).toMatch(hashHead)
  })

  it('state rpc', async () => {
    await check(api.rpc.state.getRuntimeVersion()).toMatchSnapshot()
    await checkHex(api.rpc.state.getMetadata(env.acala.blockHash)).toMatchSnapshot()
    const genesisHash = await api.rpc.chain.getBlockHash(0)
    expect(await api.rpc.state.getMetadata(genesisHash)).to.not.be.eq(await api.rpc.state.getMetadata())
  })

  it('system rpc', async () => {
    expect(await api.rpc.system.chain()).toMatch('Acala')
    expect(await api.rpc.system.name()).toMatch('Subway')
    expect(await api.rpc.system.version()).toBeInstanceOf(String)
    expect(await api.rpc.system.properties()).not.toBeNull()
    await check(api.rpc.system.health()).toMatchObject({
      peers: 0,
      isSyncing: false,
      shouldHavePeers: false,
    })
  })

  it('handles tx', async () => {
    chain.txPool.mode = BuildBlockMode.Batch

    await new Promise<void>((resolve) => {
      api.tx.balances.transfer(bob.address, 100).signAndSend(alice, (status) => {
        if (status.isInBlock) {
          resolve()
        }
      })
    })
    await new Promise((r) => setTimeout(r, 100))

    await check(api.rpc.chain.getBlock()).toMatchSnapshot()
    await check(api.query.system.account(alice.address)).toMatchSnapshot()
    await check(api.query.system.account(bob.address)).toMatchSnapshot()
  })
})
