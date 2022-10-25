import { describe, expect, it } from 'vitest'

import { api } from './helper'

describe('state rpc', () => {
  it('getXXX', async () => {
    expect((await api.rpc.state.getRuntimeVersion()).toJSON()).toMatchSnapshot()
    expect((await api.rpc.state.getMetadata()).toHex()).toMatchSnapshot()
  })

  it.todo('subscribeRuntimeVersion')
})
