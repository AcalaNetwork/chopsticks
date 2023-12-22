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

  it.todo('subscribeRuntimeVersion')
})
