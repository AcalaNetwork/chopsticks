import { describe, expect, it } from 'vitest'

import networks from './networks.js'

describe('dev_dryRun dmp', () => {
  it('works', async () => {
    const { ws, teardown } = await networks.acala({
      blockHash: '0x1d9223c88161b512ebaac53c2c7df6dc6bd2731b12273b898f582af929cc5331',
    })
    const params = [
      {
        raw: false,
        dmp: [
          // https://acala.subscan.io/xcm_message/polkadot-2ab22918c567455af3563989d852f307f4cc1250
          {
            sentAt: 14471353,
            msg: '0x02100104000100000b00280b9bba030a13000100000b00280b9bba03010300286bee0d0100040001010070c53d8e216f9c0f2e3b11c53f5f4bf3e078b995d5f0ed590f889f41e20e6531',
          },
        ],
      },
    ]
    const resp = await ws.send('dev_dryRun', params)
    expect(resp.new.system.events).toMatchSnapshot()
    await teardown()
  })
})
