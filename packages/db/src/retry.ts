import { QueryFailedError } from 'typeorm'
import { defaultLogger } from '@acala-network/chopsticks-core'

export const logger = defaultLogger.child({ name: 'retry' })

export async function retry<T>(fn: () => Promise<T>, maxRetries: number = 3, delay: number = 500): Promise<T> {
  let retries = 0
  while (retries < maxRetries) {
    try {
      return await fn()
    } catch (error) {
      if (error instanceof QueryFailedError) {
        if (error.message.includes('SQLITE_BUSY')) {
          retries++
          logger.info(`SQLite is busy. Retrying in ${delay}ms (Attempt ${retries})...`)
          await new Promise((r) => setTimeout(r, delay))
        } else {
          throw error
        }
      } else {
        throw error
      }
    }
  }
  throw new Error(`Exceeded maximum retries (${maxRetries}) for SQLite busy error.`)
}
