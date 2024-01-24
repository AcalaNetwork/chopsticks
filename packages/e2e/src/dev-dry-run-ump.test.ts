import { describe, expect, it } from 'vitest'

import { setupApi, ws } from './helper.js'

setupApi({
  endpoint: ['wss://polkadot-rpc.dwellir.com', 'wss://rpc.ibp.network/polkadot'],
  blockHash: '0xb012d04c56b65cfa1f47cb1f884d920f95d0097b1ed42f5da18d5e2a436c2f3e',
})

describe('dev_dryRun ump', () => {
  it('works', async () => {
    const params = [
      {
        raw: false,
        ump: {
          // https://acala.subscan.io/xcm_message/polkadot-ff66f28818d0b74573e62db8317e354b253fbc80
          2000: [
            '0x021000040000000007903fc4db080a130000000007903fc4db08000d010004000101009c4b11a0974cba4a395c94832fba812868a6cb0ba09e8519b3521093ea359905',
          ],
        },
      },
    ]
    const resp = await ws.send('dev_dryRun', params)
    expect(resp.new.system.events).toMatchSnapshot()
  })
})
