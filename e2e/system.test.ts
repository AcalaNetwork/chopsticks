import { describe, expect, it } from 'vitest'

import { api } from './helper'

describe('system rpc', () => {
  it('works', async () => {
    expect(await api.rpc.system.chain()).toMatch('Acala Mandala TC8')
    expect(await api.rpc.system.name()).toMatch('Acala Node')
    expect(await api.rpc.system.version()).toBeInstanceOf(String)
    expect(await api.rpc.system.properties()).not.toBeNull()
    expect((await api.rpc.system.health()).toJSON()).toMatchObject({
      peers: 0,
      isSyncing: false,
      shouldHavePeers: false,
    })
  })
})
