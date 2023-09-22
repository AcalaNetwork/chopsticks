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
export { ChainProperties, RuntimeVersion } from '@acala-network/chopsticks-core'
export * from './plugins/types'
export * from './rpc/substrate'
export { Context, SubscriptionManager, Handler } from './rpc/shared'
