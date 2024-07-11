import { afterAll, describe, expect, it } from 'vitest'

import networks from './networks.js'

describe('relaychain dev rpc', async () => {
  const { dev, teardown } = await networks.polkadot()

  afterAll(async () => {
    await teardown()
  })

  it('build blocks', async () => {
    expect(await dev.newBlock()).toMatchInlineSnapshot(
      `"0x944830e4d3cf6b4c803c23d2ddd2dc9efa5cdaec9d3289107a828638eafdc58f"`,
    )
    expect(await dev.newBlock()).toMatchInlineSnapshot(
      `"0xb823303eb5c79ef4e865f49adbd39f8607d699ac03b30d256441989212de866e"`,
    )
    expect(await dev.newBlock()).toMatchInlineSnapshot(
      `"0xd37527c814d86869b308f16f3eb6126f95da3b8f5a1a782f41e356454215d916"`,
    )
  })
})
