import dotenv from 'dotenv'

import { SetupOption, setupContext } from '@acala-network/chopsticks-tests/src'

dotenv.config()

const endpoints = {
  polkadot: 'wss://rpc.polkadot.io',
  statemint: 'wss://statemint-rpc.polkadot.io',
  acala: 'wss://acala-rpc-0.aca-api.network',
  kusama: 'wss://kusama-rpc.polkadot.io',
  statemine: 'wss://statemine-rpc.polkadot.io',
  karura: 'wss://karura-rpc-0.aca-api.network',
  basilisk: 'wss://basilisk-rpc.dwellir.com',
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
      blockNumber: toNumber(process.env.POLKADOT_BLOCK_NUMBER),
      endpoint: process.env.POLKADOT_ENDPOINT ?? endpoints.polkadot,
      db: process.env.DB_PATH,
      ...options,
    }),
  statemint: (options?: Partial<SetupOption>) =>
    setupContext({
      wasmOverride: process.env.STATEMINT_WASM,
      blockNumber: toNumber(process.env.STATEMINT_BLOCK_NUMBER),
      endpoint: process.env.STATEMINT__ENDPOINT ?? endpoints.statemint,
      db: process.env.DB_PATH,
      ...options,
    }),
  acala: (options?: Partial<SetupOption>) =>
    setupContext({
      wasmOverride: process.env.ACALA_WASM,
      blockNumber: toNumber(process.env.ACALA_BLOCK_NUMBER),
      endpoint: process.env.ACALA_ENDPOINT ?? endpoints.acala,
      db: process.env.DB_PATH,
      ...options,
    }),
  kusama: (options?: Partial<SetupOption>) =>
    setupContext({
      wasmOverride: process.env.KUSAMA_WASM,
      blockNumber: toNumber(process.env.KUSAMA_BLOCK_NUMBER),
      endpoint: process.env.KUSAMA_ENDPOINT ?? endpoints.kusama,
      db: process.env.DB_PATH,
      ...options,
    }),
  statemine: (options?: Partial<SetupOption>) =>
    setupContext({
      wasmOverride: process.env.STATEMINE_WASM,
      blockNumber: toNumber(process.env.STATEMINE_BLOCK_NUMBER),
      endpoint: process.env.STATEMINE_ENDPOINT ?? endpoints.statemine,
      db: process.env.DB_PATH,
      ...options,
    }),
  karura: (options?: Partial<SetupOption>) =>
    setupContext({
      wasmOverride: process.env.KARURA_WASM,
      blockNumber: toNumber(process.env.KARURA_BLOCK_NUMBER),
      endpoint: process.env.KARURA_ENDPOINT ?? endpoints.karura,
      db: process.env.DB_PATH,
      ...options,
    }),
  basilisk: (options?: Partial<SetupOption>) =>
    setupContext({
      wasmOverride: process.env.BASILISK_WASM,
      blockNumber: toNumber(process.env.BASILISK_BLOCK_NUMBER),
      endpoint: process.env.BASILISK_ENDPOINT ?? endpoints.basilisk,
      db: process.env.DB_PATH,
      ...options,
    }),
}
