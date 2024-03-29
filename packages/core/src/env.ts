import * as z from 'zod'

const environmentSchema = z.object({
  /**
   * Disable auto HRMP on setup. Default is `false`.
   */
  DISABLE_AUTO_HRMP: z.boolean().default(false),
  PORT: z.string().optional(),
  /**
   * Disable plugins for faster startup. Default is `false`.
   */
  DISABLE_PLUGINS: z.boolean().default(false),
  HTTP_PROXY: z.string().optional(),
  HTTPS_PROXY: z.string().optional(),
  /**
   * Chopsticks log level, "fatal" | "error" | "warn" | "info" | "debug" | "trace".
   * Default is "info".
   */
  LOG_LEVEL: z.string().default('info'),
  /**
   * Don't truncate long strings, show full log output. Default is `false`.
   */
  VERBOSE_LOG: z.boolean().default(false),
  /**
   * Don't log objects. Default is `false`.
   */
  LOG_COMPACT: z.boolean().default(false),
})

/**
 * Environment variables available for users
 */
export const environment = environmentSchema.parse(typeof process === 'object' ? process.env : {})
