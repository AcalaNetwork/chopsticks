import { describe, expect, it } from 'vitest'

import { setup } from '../../../index.js'
import { prepareBlock, traceCalls } from '../utils.js'

describe.runIf(process.env.CI || process.env.RUN_ALL)('trace-call', () => {
  it('Acala', async () => {
    const chain = await setup({
      endpoint: 'wss://acala-rpc.aca-api.network',
    })

    const { tracingBlock, extrinsic } = await prepareBlock(
      chain,
      5865634,
      '0xda7ddf476560376465d36221d1d16197bfd74c3fc38f8cbdc44f81ed6332dd0c',
    )
    const calls = await traceCalls(tracingBlock, extrinsic)
    expect(JSON.stringify(calls, null, 2)).toMatchSnapshot()
  })

  it('Substrate+EVM', async () => {
    const chain = await setup({
      endpoint: 'wss://acala-rpc.aca-api.network',
    })

    // DEX add_liquidity ACA & ERC20
    const { tracingBlock, extrinsic } = await prepareBlock(
      chain,
      5874872,
      '0x1de18686a06d708c31716e18cc7bf8564f4ecaea296d72bce5f2d091eb34658b',
    )
    const calls = await traceCalls(tracingBlock, extrinsic)
    expect(JSON.stringify(calls, null, 2)).toMatchSnapshot()
  })

  it('Karura', async () => {
    const chain = await setup({
      endpoint: 'wss://karura-rpc.aca-api.network',
    })

    const { tracingBlock, extrinsic } = await prepareBlock(
      chain,
      6578222,
      '0xa12043253e9d10c2237c872b39da50d425dc7954436d9fedfe0335daba0cd8eb',
    )
    const calls = await traceCalls(tracingBlock, extrinsic)
    expect(JSON.stringify(calls, null, 2)).toMatchSnapshot()
  })
})
