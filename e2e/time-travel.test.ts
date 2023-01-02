import { HexString } from '@polkadot/util/types'
import { chain, setupApi, ws } from './helper'
import { describe, expect, it } from 'vitest'
import { getCurrentTimestamp, getSlotDuration, timeTravel } from '../src/utils/time-travel'

describe.each([
  {
    chain: 'Polkadot',
    endpoint: 'wss://rpc.polkadot.io',
    blockHash: '0xb7fb7cfe79142652036e73f8044e0efbbbe7d3fb71cabc212efd5968c9041950' as HexString,
  },
  {
    chain: 'Acala',
    endpoint: 'wss://acala-rpc-1.aca-api.network',
    blockHash: '0x1d9223c88161b512ebaac53c2c7df6dc6bd2731b12273b898f582af929cc5331' as HexString,
  },
])('Can time-travel on $chain', async ({ endpoint, blockHash }) => {
  setupApi({ endpoint, blockHash })

  it.each(['Nov 30, 2022', 'Dec 22, 2022', 'Jan 1, 2024'])('%s', async (date) => {
    const timestamp = Date.parse(date)

    await timeTravel(chain, timestamp)

    expect(await getCurrentTimestamp(chain)).eq(timestamp)

    // can build block successfully
    await ws.send('dev_newBlock', [])

    expect(await getCurrentTimestamp(chain)).eq(timestamp + (await getSlotDuration(chain)))
  })
})
