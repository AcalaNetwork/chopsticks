import { describe, it } from 'vitest'

import { api, env, expectHex, expectJson, setupApi } from './helper'

setupApi(env.mandala)

describe('state rpc', () => {
  it('getXXX', async () => {
    await expectJson(api.rpc.state.getRuntimeVersion()).toMatchSnapshot()
    await expectHex(api.rpc.state.getMetadata()).toMatchSnapshot()
  })

  it.todo('subscribeRuntimeVersion')
})
