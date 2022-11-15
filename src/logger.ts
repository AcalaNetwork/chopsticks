import pino from 'pino'
export const defaultLogger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty',
  },
})

export const truncate = (str?: string) => {
  if (str == null) {
    return str
  }
  if (str.length > 66) {
    return str.slice(0, 34) + '…' + str.slice(-32)
  } else {
    return str
  }
}
