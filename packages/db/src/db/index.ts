import Database from 'better-sqlite3'
import { DataSource } from 'typeorm'

import * as entities from './entities.js'

export const openDb = async (dbPath: string): Promise<DataSource> => {
  const source = new DataSource({
    type: 'better-sqlite3',
    driver: Database,
    database: dbPath,
    entities: Object.values(entities),
    synchronize: true,
    logging: false,
    enableWAL: true, // improve performance and concurrency
  })

  await source.initialize()

  return source
}
