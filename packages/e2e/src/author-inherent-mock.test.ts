import { describe, it } from 'vitest'
import { setupContext } from '@acala-network/chopsticks-testing'

describe.runIf(process.env.CI || process.env.RUN_ALL)('Nimbus author inherent mock', async () => {
  it('Manta build blocks', async () => {
    const { dev, teardown } = await setupContext({
      endpoint: 'wss://ws.manta.systems',
      db: !process.env.RUN_TESTS_WITHOUT_DB ? 'e2e-tests-db.sqlite' : undefined,
    })
    await dev.newBlock({ count: 2 })
    await teardown()
  })

  it('Tanssi container build blocks', async () => {
    const { dev, teardown } = await setupContext({
      endpoint: 'wss://fraa-dancebox-3001-rpc.a.dancebox.tanssi.network',
      db: !process.env.RUN_TESTS_WITHOUT_DB ? 'e2e-tests-db.sqlite' : undefined,
    })
    await dev.newBlock({ count: 2 })
    await teardown()
  })

  it('Tanssi orchestrator build blocks', async () => {
    const { dev, teardown } = await setupContext({
      endpoint: 'wss://dancebox.tanssi-api.network',
      db: !process.env.RUN_TESTS_WITHOUT_DB ? 'e2e-tests-db.sqlite' : undefined,
    })
    await dev.newBlock({ count: 2 })
    await teardown()
  })

  it('Moonbeam build blocks', async () => {
    const { dev, teardown } = await setupContext({
      endpoint: 'wss://wss.api.moonbeam.network',
      db: !process.env.RUN_TESTS_WITHOUT_DB ? 'e2e-tests-db.sqlite' : undefined,
    })
    await dev.newBlock({ count: 2 })
    await teardown()
  })
})
