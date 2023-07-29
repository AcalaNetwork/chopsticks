import 'reflect-metadata'
import { DataSource } from 'typeorm'

import * as entities from './entities'

export const openDb = async (dbPath: string): Promise<DataSource> => {
  const source = new DataSource({
    type: 'sqljs',
    location: dbPath,
    entities: Object.values(entities),
    synchronize: true,
    autoSave: true,
    logging: false,
  })

  await source.initialize()

  return source
}
