import { afterAll, describe, expect, it } from 'vitest'

import { setupAll } from './helper'

const KUSAMA_STORAGE = {
  FellowshipCollective: {
    $removePrefix: ['IdToIndex', 'IndexToId', 'MemberCount', 'Members'],
    Voting: [],
  },
  ParasDisputes: {
    $removePrefix: ['disputes'],
  },
}

describe.each([
  { chain: 'Polkadot', endpoint: 'wss://rpc.polkadot.io' },
  { chain: 'Statemint', endpoint: 'wss://statemint-rpc.polkadot.io' },
  { chain: 'Polkadot Collectives', endpoint: 'wss://polkadot-collectives-rpc.polkadot.io' },
  { chain: 'Acala', endpoint: 'wss://acala-rpc-1.aca-api.network' },

  { chain: 'Kusama', endpoint: 'wss://kusama-rpc.polkadot.io', storage: KUSAMA_STORAGE },
  { chain: 'Statemine', endpoint: 'wss://statemine-rpc.polkadot.io' },
  { chain: 'Karura', endpoint: 'wss://karura-rpc-1.aca-api.network' },

  { chain: 'Westend', endpoint: 'wss://westend-rpc.polkadot.io' },
  { chain: 'Westmint', endpoint: 'wss://westmint-rpc.polkadot.io' },
  { chain: 'Westend Collectives', endpoint: 'wss://sys.ibp.network/collectives-westend' },
])('Latest $chain can build blocks', async ({ endpoint, storage }) => {
  const { setup, teardownAll } = await setupAll({ endpoint })

  afterAll(async () => {
    await teardownAll()
  })

  it.runIf(process.env.CI)('build blocks', async () => {
    const { chain, ws, teardown } = await setup()
    storage && (await ws.send('dev_setStorage', [storage]))
    const blockNumber = chain.head.number
    await ws.send('dev_newBlock', [{ count: 2 }])
    expect(chain.head.number).eq(blockNumber + 2)
    await teardown()
  })

  it.runIf(process.env.CI)('build block using unsafeBlockHeight', async () => {
    const { chain, ws, teardown } = await setup()
    storage && (await ws.send('dev_setStorage', [storage]))
    const blockNumber = chain.head.number
    const unsafeBlockHeight = blockNumber + 100
    await ws.send('dev_newBlock', [{ count: 2, unsafeBlockHeight }])
    expect(chain.head.number).eq(unsafeBlockHeight + 1)
    await teardown()
  })
})
