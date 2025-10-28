import { type SetupOption, setupContext } from '@acala-network/chopsticks-testing'
import { config as dotenvConfig } from 'dotenv'

dotenvConfig()

const endpoints = {
  polkadot: ['wss://rpc.ibp.network/polkadot'],
  acala: ['wss://acala-rpc.n.dwellir.com'],
}

export type Network = Awaited<ReturnType<typeof setupContext>>

export default {
  polkadot: (options?: Partial<SetupOption>) =>
    setupContext({
      blockNumber: 14500000,
      endpoint: endpoints.polkadot,
      db: !process.env.RUN_TESTS_WITHOUT_DB ? 'e2e-tests-db.sqlite' : undefined,
      ...options,
    }),
  acala: (options?: Partial<SetupOption>) =>
    setupContext({
      blockNumber: 3000000,
      endpoint: endpoints.acala,
      db: !process.env.RUN_TESTS_WITHOUT_DB ? 'e2e-tests-db.sqlite' : undefined,
      ...options,
    }),
}
