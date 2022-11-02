import { describe, expect, it } from 'vitest'

import { dev, env, setupApi } from './helper'

setupApi(env.rococo)

describe('relaychain dev rpc', () => {
  it('build blocks', async () => {
    expect(await dev.newBlock()).toMatchInlineSnapshot(
      '"0xd770603e727fea3ee5de4863767d9fa961a715cf1b8c2cae704dc9dc616ea27b"'
    )
    // TODO somehow keep building blocks took too long
    // expect(await dev.newBlock()).toMatchInlineSnapshot()
    // expect(await dev.newBlock()).toMatchInlineSnapshot()
  })
})
