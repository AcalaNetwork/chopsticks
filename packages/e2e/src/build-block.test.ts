import { describe, expect, it } from 'vitest'

import { setupAll } from './helper.js'

const KUSAMA_STORAGE = {
  FellowshipCollective: {
    $removePrefix: ['IdToIndex', 'IndexToId', 'MemberCount', 'Members'],
    Voting: [],
  },
  ParasDisputes: {
    $removePrefix: ['disputes'],
  },
}

const cases = [
  { chain: 'Polkadot', endpoint: ['wss://polkadot-rpc.n.dwellir.com', 'wss://rpc.polkadot.io'] },
  { chain: 'Polkadot Asset Hub', endpoint: 'wss://asset-hub-polkadot-rpc.n.dwellir.com' },
  { chain: 'Polkadot Collectives', endpoint: 'wss://polkadot-collectives-rpc.polkadot.io' },
  { chain: 'Acala', endpoint: ['wss://acala-rpc.aca-api.network'] },

  {
    chain: 'Kusama',
    endpoint: ['wss://kusama-rpc.n.dwellir.com', 'wss://kusama-rpc.polkadot.io'],
    storage: KUSAMA_STORAGE,
  },
  {
    chain: 'Kusama Asset Hub',
    endpoint: ['wss://kusama-asset-hub-rpc.polkadot.io', 'wss://asset-hub-kusama-rpc.n.dwellir.com'],
    ci: false,
  },
  {
    chain: 'Karura',
    endpoint: ['wss://karura-rpc.aca-api.network', 'wss://karura-rpc.n.dwellir.com'],
  },
  { chain: 'Westend', endpoint: ['wss://westend-rpc.n.dwellir.com', 'wss://westend-rpc.polkadot.io'] },
  {
    chain: 'Westend Asset Hub',
    endpoint: [
      'wss://asset-hub-westend-rpc.n.dwellir.com',
      'wss://westend-asset-hub-rpc.polkadot.io',
      'wss://westmint-rpc.polkadot.io',
    ],
  },
  { chain: 'Westend Collectives', endpoint: 'wss://westend-collectives-rpc.polkadot.io' },
]

describe
  .runIf(process.env.CI || process.env.RUN_ALL)
  .concurrent.each(cases.filter(({ ci = true }) => process.env.RUN_ALL || ci))(
  'Latest $chain can build blocks',
  async ({ endpoint, storage }) => {
    it('builds blocks', { timeout: 300_000, retry: 1 }, async () => {
      const { setupPjs, teardownAll } = await setupAll({ endpoint })

      try {
        const { chain, ws, teardown } = await setupPjs()
        try {
          if (storage) {
            await ws.send('dev_setStorage', [storage])
          }
          const blockNumber = chain.head.number
          await ws.send('dev_newBlock', [{ count: 2 }])
          expect(chain.head.number).eq(blockNumber + 2)

          const unsafeBlockHeight = chain.head.number + 100
          await ws.send('dev_newBlock', [{ count: 2, unsafeBlockHeight }])
          expect(chain.head.number).eq(unsafeBlockHeight + 1)

          await expect(ws.send('dev_newBlock', [{ unsafeBlockHeight: blockNumber - 1 }])).rejects.toThrowError(
            '1: unsafeBlockHeight must be greater than current block height',
          )
          expect(chain.head.number).eq(unsafeBlockHeight + 1)
        } finally {
          await teardown()
        }
      } finally {
        await teardownAll()
      }
    })
  },
)
