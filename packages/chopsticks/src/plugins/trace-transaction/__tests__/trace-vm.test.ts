import { describe, expect, it } from 'vitest'

import { setup } from '../../../index.js'
import { prepareBlock, traceVM } from '../utils.js'

describe('trace-vm', async () => {
  const acala = await setup({
    endpoint: 'wss://acala-rpc.aca-api.network',
  })

  it('should trace opcodes', async () => {
    const { tracingBlock, extrinsic } = await prepareBlock(
      acala,
      5865634,
      '0xda7ddf476560376465d36221d1d16197bfd74c3fc38f8cbdc44f81ed6332dd0c',
    )
    const steps = await traceVM(tracingBlock, extrinsic)

    expect(steps.length).toMatchInlineSnapshot(`3398`)
    expect(steps[0]).toMatchInlineSnapshot(`
      {
        "depth": 0,
        "gas": 218608,
        "memory": null,
        "op": "PUSH1",
        "pc": 0,
        "stack": [],
      }
    `)
    expect(steps[steps.length - 1]).toMatchInlineSnapshot(`
      {
        "depth": 0,
        "gas": 61571,
        "memory": [
          "0000000000000000000000000000000000000000000000000000000000000001",
          "000000020000000000000000000000000000000000000000000000000000007d",
          "414210be00000000000000000000000000000000000000000000000000000080",
        ],
        "op": "RETURN",
        "pc": 1087,
        "stack": [
          "0x11",
          "0x0167",
          "0x0167",
          "0xfa68ce20228ae14ac338aedb95f0f55b4e8b2bbe",
          "0x01",
          "0x01",
          "0x20",
          "0x00",
        ],
      }
    `)
  })
})
