import { afterAll, describe, expect, it } from 'vitest'
import { setupContext, testingPairs } from '@acala-network/chopsticks-testing'

describe('Migration', async () => {
  const { alice } = testingPairs()

  const { api, dev, teardown } = await setupContext({
    wasmOverride: new URL('../blobs/shibuya-118.wasm', import.meta.url).pathname,
    blockNumber: 5335600,
    endpoint: 'wss://shibuya-rpc.dwellir.com',
    db: !process.env.RUN_TESTS_WITHOUT_DB ? 'e2e-tests-db.sqlite' : undefined,
    timeout: 400_000,
  })

  afterAll(async () => await teardown())

  it.runIf(process.env.CI || process.env.RUN_ALL)(
    'migrate all entries',
    async () => {
      {
        const version = await api.query.system.lastRuntimeUpgrade()
        expect(version.toHuman()).toMatchInlineSnapshot(`
          {
            "specName": "shibuya",
            "specVersion": "115",
          }
        `)
      }
      await dev.setStorage({
        System: {
          Account: [[[alice.address], { providers: 1, data: { free: '100000000000000000000000' } }]],
        },
      })

      await dev.newBlock()
      {
        const version = await api.query.system.lastRuntimeUpgrade()
        expect(version.toHuman()).toMatchInlineSnapshot(`
          {
            "specName": "shibuya",
            "specVersion": "118",
          }
        `)
      }

      for (const items of [301 /*, 295*/]) {
        // number of entries migrated, matches with onchain data
        // first call will migrate 301 entries, second call will migrate 295 entries
        await api.tx.dappStakingMigration.migrate(null).signAndSend(alice)
        await dev.newBlock()
        const events = await api.query.system.events()
        expect(events.toHuman()).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              event: expect.objectContaining({
                section: 'dappStakingMigration',
                method: 'EntriesMigrated',
                data: [`${items}`],
              }),
            }),
          ]),
        )
      }
    },
    { timeout: 400_000 },
  )
})
