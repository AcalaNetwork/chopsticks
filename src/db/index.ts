import 'reflect-metadata'
import { DataSource } from 'typeorm'

import * as entities from './entities'

export const openDb = async (dbPath: string): Promise<DataSource> => {
  const source = new DataSource({
    type: 'sqlite',
    database: dbPath,
    entities: Object.values(entities),
    synchronize: true,
    logging: false,
  })

  await source.initialize()

  return source
}
