import * as z from 'zod'

export const environmentSchema = z.object({
  /**
   * Disable auto HRMP on setup. Default is `false`.
   */
  DISABLE_AUTO_HRMP: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  /**
   * Set port for Chopsticks to listen on, default is `8000`.
   */
  PORT: z.string().optional(),
  /**
   * Disable plugins for faster startup. Default is `false`.
   */
  DISABLE_PLUGINS: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  HTTP_PROXY: z.string().optional(),
  HTTPS_PROXY: z.string().optional(),
  /**
   * Chopsticks log level, "fatal" | "error" | "warn" | "info" | "debug" | "trace".
   * Default is "info".
   */
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  /**
   * Don't truncate log messages, show full log output. Default is `false`.
   */
  VERBOSE_LOG: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  /**
   * Don't log objects. Default is `false`.
   */
  LOG_COMPACT: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
})

/**
 * Environment variables available for users
 */
export const environment = environmentSchema.parse(typeof process === 'object' ? process.env : {})
