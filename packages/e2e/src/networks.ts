import { config as dotenvConfig } from 'dotenv'

import { SetupOption, setupContext } from '@acala-network/chopsticks-testing'

dotenvConfig()

const endpoints = {
  polkadot: 'wss://rpc.polkadot.io',
  acala: 'wss://acala-rpc-1.aca-api.network',
}

const toNumber = (value: string | undefined): number | undefined => {
  if (value === undefined) {
    return undefined
  }

  return Number(value)
}

export type Network = Awaited<ReturnType<typeof setupContext>>

export default {
  polkadot: (options?: Partial<SetupOption>) =>
    setupContext({
      wasmOverride: process.env.POLKADOT_WASM,
      blockNumber: toNumber(process.env.POLKADOT_BLOCK_NUMBER) || 14500000,
      endpoint: process.env.POLKADOT_ENDPOINT ?? endpoints.polkadot,
      db: process.env.DB_PATH,
      ...options,
    }),
  acala: (options?: Partial<SetupOption>) =>
    setupContext({
      wasmOverride: process.env.ACALA_WASM,
      blockNumber: toNumber(process.env.ACALA_BLOCK_NUMBER) || 3000000,
      endpoint: process.env.ACALA_ENDPOINT ?? endpoints.acala,
      db: process.env.DB_PATH,
      ...options,
    }),
}
