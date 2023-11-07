import { afterAll, describe, expect, it } from 'vitest'

import networks from './networks.js'

describe('relaychain dev rpc', async () => {
  const { dev, teardown } = await networks.polkadot()

  afterAll(async () => {
    await teardown()
  })

  it('build blocks', async () => {
    expect(await dev.newBlock()).toMatchInlineSnapshot(
      '"0xbc578eb38288c517a8b9d733af1a0a5283698b24c2360a15bbade3a325151ab6"',
    )
    expect(await dev.newBlock()).toMatchInlineSnapshot(
      '"0x25bbf7510c57d5e7e26c1dd68c77cbcf25e4c08f5e51fd18d9c3df98507df0fc"',
    )
    expect(await dev.newBlock()).toMatchInlineSnapshot(
      '"0xd580fd6d3c17389c2572ef81a21c9be79abb833d228896a7c676799a9def5b58"',
    )
  })
})
