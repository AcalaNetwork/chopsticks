/**
 * Chopsticks core package. A common package for usage in both server and browser.
 * It contains a local blockchain implementation, a transaction pool, a runtime executor and more!
 *
 * @privateRemarks
 * Above is the package description for `chopsticks-core` package.
 *
 * @packageDocumentation
 */

import { HexString } from '@polkadot/util/types'

export type ChainProperties = {
  ss58Format?: number
  tokenDecimals?: number[]
  tokenSymbol?: string[]
}

export type Header = {
  parentHash: HexString
  number: HexString
  stateRoot: HexString
  extrinsicsRoot: HexString
  digest: {
    logs: HexString[]
  }
}

export type SignedBlock = {
  block: {
    header: Header
    extrinsics: HexString[]
  }
  justifications?: HexString[]
}

export * from './api.js'
export * from './blockchain/index.js'
export * from './blockchain/block.js'
export * from './blockchain/block-builder.js'
export * from './blockchain/txpool.js'
export * from './blockchain/storage-layer.js'
export * from './blockchain/head-state.js'
export * from './utils/index.js'
export * from './wasm-executor/index.js'
export * from './schema/index.js'
export * from './xcm/index.js'
export * from './setup.js'
export * from './database.js'
export * from './blockchain/inherent/index.js'
export * from './logger.js'
export * from './offchain.js'
export * from './chopsticks-provider.js'
export * from './genesis-provider.js'
export * from './rpc/index.js'
