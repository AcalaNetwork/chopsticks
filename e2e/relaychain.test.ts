import { describe, expect, it } from 'vitest'

import { dev, env, setupApi } from './helper'

setupApi(env.rococo)

describe('relaychain dev rpc', () => {
  it('build blocks', async () => {
    expect(await dev.newBlock()).toMatchInlineSnapshot(
      '"0x772a2a7343fd18168fba785166d4eaacbc868c93fcb59defbeb17d879beec7b7"'
    )
    expect(await dev.newBlock()).toMatchInlineSnapshot(
      '"0x6445b65747e435eba97050cc38939d943ceb6bdd9c584160be9f7388b1f27f8f"'
    )
    expect(await dev.newBlock()).toMatchInlineSnapshot(
      '"0xc2f4c8a21cc7d34bf4938cac5ee75ff6607ddbd626ef2b6b6cdad63be90568ea"'
    )
  })
})
