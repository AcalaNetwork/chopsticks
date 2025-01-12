import { pino } from 'pino'

import { environment } from './env.js'

export const pinoLogger = pino({
  level: environment.LOG_LEVEL,
  transport: {
    target: 'pino-pretty',
    options: {
      ignore: 'pid,hostname',
      hideObject: environment.LOG_COMPACT,
    },
  },
})

export const defaultLogger = pinoLogger.child({ app: 'chopsticks' })

const innerTruncate =
  (level = 0) =>
  (val: any) => {
    const verboseLog = environment.VERBOSE_LOG
    const levelLimit = verboseLog ? 10 : 5
    if (val == null) {
      return val
    }
    if (level > levelLimit) {
      return '( Too Deep )'
    }
    switch (typeof val) {
      case 'string':
        if (val.length > 66 && !verboseLog) {
          return `${val.slice(0, 34)}…${val.slice(-32)}`
        }
        return val
      case 'object':
        if (Array.isArray(val)) {
          return val.map(innerTruncate(level + 1))
        }
        return Object.fromEntries(
          Object.entries(val.toJSON ? val.toJSON() : val).map(([k, v]) => [k, innerTruncate(level + 1)(v)]),
        )
      default:
        return val
    }
  }

export const truncate = (val: any) => innerTruncate(0)(val)
