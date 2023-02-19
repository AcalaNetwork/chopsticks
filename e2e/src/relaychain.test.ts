import { describe, expect, it } from 'vitest'

import { dev, env, setupApi } from './helper'

setupApi(env.rococo)

describe('relaychain dev rpc', () => {
  it('build blocks', async () => {
    expect(await dev.newBlock()).toMatchInlineSnapshot(
      '"0x884fe052592f23bf3e3925e43a08c8b89a748e954599ea0e6a334efb05935729"'
    )
    expect(await dev.newBlock()).toMatchInlineSnapshot(
      '"0xac37acb4b711beff7e70351eb2a61ac0d9fb8d71bb0a0c418790139da5cfbe46"'
    )
    expect(await dev.newBlock()).toMatchInlineSnapshot(
      '"0xdd263f075fb2812d72d9a1ee30a8df0519dcfc5ca679289abfacfc2d7f06cee1"'
    )
  })
})
