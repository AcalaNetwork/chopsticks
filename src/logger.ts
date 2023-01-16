import createLogger from 'pino'

export const defaultLogger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty',
  },
})

export const truncate = (val: any) => {
  if (val == null) {
    return val
  }
  switch (typeof val) {
    case 'string':
      if (val.length > 66) {
        return val.slice(0, 34) + '…' + val.slice(-32)
      } else {
        return val
      }
    case 'object':
      if (Array.isArray(val)) {
        return val.map(truncate)
      }
      return Object.fromEntries(Object.entries(val).map(([k, v]) => [k, truncate(v)]))
    default:
      return val
  }
}
