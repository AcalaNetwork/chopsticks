import { describe, expect, it } from 'vitest'

import { api, chain, setupApi } from '../helper.js'
import { overrideStorage } from '@acala-network/chopsticks/utils/override.js'

setupApi({
  endpoint: 'wss://rpc.polkadot.io',
})

describe('supports `()` void type', async () => {
  it('null value works when add whitelistedCall', async () => {
    await overrideStorage(chain, {
      Whitelist: {
        WhitelistedCall: [
          [['0x3146d2141cdb95de80488d6cecbb5d7577dd59069efc366cb1be7fe64f02e62c'], null],
          [['0x9f2f52051d005133be07b4c1cd98b1fd1ede2f5823e4617eca99f9513b48c152'], null],
        ],
      },
    })

    const entries = await api.query.whitelist.whitelistedCall.entries()
    expect(entries).toMatchInlineSnapshot(`
    [
      [
        "0xa0eb495036d368196a2b6c51d9d788819e14dde2d232d46598fbe812b043adedbc76205d207463033146d2141cdb95de80488d6cecbb5d7577dd59069efc366cb1be7fe64f02e62c",
        null,
      ],
      [
        "0xa0eb495036d368196a2b6c51d9d788819e14dde2d232d46598fbe812b043adedd3a7a6caf10573d29f2f52051d005133be07b4c1cd98b1fd1ede2f5823e4617eca99f9513b48c152",
        null,
      ],
    ]
  `)
  })

  it('null value works when remove whitelistedCall', async () => {
    await overrideStorage(chain, {
      Whitelist: {
        $removePrefix: ['WhitelistedCall'],
      },
    })

    const entries = await api.query.whitelist.whitelistedCall.entries()
    expect(entries).toMatchInlineSnapshot(`[]`)
  })
})
