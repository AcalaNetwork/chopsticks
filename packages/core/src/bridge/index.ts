import { defaultLogger } from '../logger.js'

export const bridgeLogger = defaultLogger.child({ name: 'bridge' })

export * from './encode.js'
