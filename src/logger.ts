import pino from 'pino'
export const defaultLogger = pino({
  level: process.env.LOG_LEVEL || 'info',
})
