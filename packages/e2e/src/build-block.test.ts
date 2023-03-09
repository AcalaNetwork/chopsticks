import { afterAll, describe, expect, it } from 'vitest'

import { setupAll } from './helper'

describe.each([
  { chain: 'Polkadot', endpoint: 'wss://rpc.polkadot.io' },
  { chain: 'Statemint', endpoint: 'wss://statemint-rpc.polkadot.io' },
  { chain: 'Polkadot Collectives', endpoint: 'wss://polkadot-collectives-rpc.polkadot.io' },
  { chain: 'Acala', endpoint: 'wss://acala-rpc-1.aca-api.network' },

  { chain: 'Kusama', endpoint: 'wss://kusama-rpc.polkadot.io' },
  { chain: 'Statemine', endpoint: 'wss://statemine-rpc.polkadot.io' },
  { chain: 'Karura', endpoint: 'wss://karura-rpc-1.aca-api.network' },

  { chain: 'Westend', endpoint: 'wss://westend-rpc.polkadot.io' },
  { chain: 'Westmint', endpoint: 'wss://westmint-rpc.polkadot.io' },
  { chain: 'Westend Collectives', endpoint: 'wss://westend-collectives-rpc.polkadot.io' },
])('Latest $chain can build blocks', async ({ endpoint }) => {
  const { setup, teardownAll } = await setupAll({ endpoint })

  afterAll(async () => {
    await teardownAll()
  })

  it.skipIf(!process.env.RUN_ALL_TESTS)('build blocks', async () => {
    const { chain, ws, teardown } = await setup()
    const blockNumber = chain.head.number
    await ws.send('dev_newBlock', [{ count: 2 }])
    expect(chain.head.number).eq(blockNumber + 2)
    await teardown()
  })
})
