import { describe, expect, it } from 'vitest'
import { getCurrentTimestamp, getSlotDuration } from '@acala-network/chopsticks-core/utils/index.js'
import { timeTravel } from '@acala-network/chopsticks-core/utils/time-travel.js'

import networks from './networks.js'

describe.each(['polkadot', 'acala'])('Can time-travel on %s', async (name) => {
  const { chain, ws } = await networks[name as keyof typeof networks]()

  it.each(['Nov 30, 2022', 'Dec 22, 2022', 'Jan 1, 2024'])('%s', async (date) => {
    const timestamp = Date.parse(date)

    await timeTravel(chain, timestamp)

    expect(await getCurrentTimestamp(chain)).eq(BigInt(timestamp))

    // can build block successfully
    await ws.send('dev_newBlock', [])

    expect(await getCurrentTimestamp(chain)).eq(BigInt(timestamp + (await getSlotDuration(chain))))
  })
})
