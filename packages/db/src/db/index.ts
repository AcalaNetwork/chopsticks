import { DataSource } from 'typeorm'

import * as entities from './entities.js'

export const openDb = async (dbPath: string): Promise<DataSource> => {
  const source = new DataSource({
    type: 'sqlite',
    database: dbPath,
    entities: Object.values(entities),
    synchronize: true,
    logging: false,
    enableWAL: true, // improve performance and concurrency
    busyErrorRetry: 1000, // typeorm retry timeout
    busyTimeout: 5000, // retry for 5 seconds, sqlite PRAGMA busy_timeout
  })

  await source.initialize()

  return source
}
