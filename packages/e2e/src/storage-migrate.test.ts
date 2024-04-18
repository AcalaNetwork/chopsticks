import { describe, expect, it } from 'vitest'

import { api, dev, setupApi } from './helper.js'

setupApi({
  endpoint: 'wss://kusama-archive.mangata.online',
  blockHash: '0xea25e5e478f33cf70eebcd4a8b94b8dde361537eaa7a8b53c58a03026a4ebac0',
  mockSignatureHost: true,
  runtimeLogLevel: 5,
  registeredTypes: {
    types: {
      ShufflingSeed: {
        seed: 'H256',
        proof: 'H512',
      },
      Header: {
        parentHash: 'Hash',
        number: 'Compact<BlockNumber>',
        stateRoot: 'Hash',
        extrinsicsRoot: 'Hash',
        digest: 'Digest',
        seed: 'ShufflingSeed',
        count: 'BlockNumber',
      },
    },
  },
})

describe.runIf(process.env.CI || process.env.RUN_ALL)('storage-migrate', async () => {
  it(
    'no empty keys',
    async () => {
      await dev.newBlock()
      const metadatas = await api.query.assetRegistry.metadata.entries()
      expect(metadatas.some(([_, v]) => v.isEmpty)).toBeFalsy()
    },
    { timeout: 300_000 },
  )
})
