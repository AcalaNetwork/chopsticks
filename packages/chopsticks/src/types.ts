/**
 * Chopsticks JSON RPC and CLI.
 *
 * @remarks
 * This package extends the `@acala-network/chopsticks-core` package a with JSON RPC server and CLI support.
 *
 * @privateRemarks
 * Above is the package documentation for 'chopsticks' package.
 * `export` below is for tsdoc.
 *
 * @packageDocumentation
 */
export type {
  ChainProperties,
  RuntimeVersion,
  Context,
  SubscriptionManager,
  Handler,
} from '@acala-network/chopsticks-core'
export * from '@acala-network/chopsticks-core/rpc/substrate/index.js'
export * as DevRPC from '@acala-network/chopsticks-core/rpc/dev/index.js'
export * from './plugins/types.js'
