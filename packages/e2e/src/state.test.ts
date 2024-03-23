import { describe, expect, it } from 'vitest'

import { api, check, checkHex, env, setupApi } from './helper.js'

setupApi(env.acala)

describe('state rpc', () => {
  it('getXXX', async () => {
    await check(api.rpc.state.getRuntimeVersion()).toMatchSnapshot()
    await checkHex(api.rpc.state.getMetadata(env.acala.blockHash)).toMatchSnapshot()
    const genesisHash = await api.rpc.chain.getBlockHash(0)
    expect(await api.rpc.state.getMetadata(genesisHash)).to.not.be.eq(await api.rpc.state.getMetadata())
  })

  it('getReadProof', async () => {
    expect(
      await api.rpc.state.getReadProof(
        [
          '0xf0c365c3cf59d671eb72da0e7a4113c44e7b9012096b41c4eb3aaf947f6ea429',
          '0xf0c365c3cf59d671eb72da0e7a4113c49f1f0515f462cdcf84e0f1d6045dfcbb',
        ],
        env.acala.blockHash,
      ),
    ).toMatchSnapshot()
  })

  it.todo('subscribeRuntimeVersion')
})
