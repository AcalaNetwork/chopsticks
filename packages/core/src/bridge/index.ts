import { defaultLogger } from '../logger.js'

export const bridgeLogger = defaultLogger.child({ name: 'bridge' })

export * from './storage-keys.js'
