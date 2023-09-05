/**
 * Get pino log level from number input, default to 'info'.
 *
 * [off = 0; error = 1; warn = 2; info = 3; debug = 4; trace = 5]
 */
export const getLogLevel = (level: number | undefined) => {
  switch (level) {
    case 0:
      return 'off'
    case 1:
      return 'error'
    case 2:
      return 'warn'
    case 3:
      return 'info'
    case 4:
      return 'debug'
    case 5:
      return 'trace'
    default:
      return 'info'
  }
}
