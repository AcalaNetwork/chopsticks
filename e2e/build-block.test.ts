import { afterAll, describe, expect, it } from 'vitest'

import { setupAll } from './helper'

describe.each([
  { chain: 'Polkadot', endpoint: 'wss://rpc.polkadot.io' },
  { chain: 'Kusama', endpoint: 'wss://kusama.api.onfinality.io/public-ws' },
  { chain: 'Acala', endpoint: 'wss://acala-rpc-1.aca-api.network' },
])('Latest $chain can build blocks', async ({ endpoint }) => {
  const { setup, teardownAll } = await setupAll({ endpoint })

  afterAll(async () => {
    await teardownAll()
  })

  it('build blocks', async () => {
    const { chain, ws, teardown } = await setup()
    const blockNumber = chain.head.number
    await ws.send('dev_newBlock', [{ count: 3 }])
    expect(chain.head.number).eq(blockNumber + 3)
    await teardown()
  })
})
