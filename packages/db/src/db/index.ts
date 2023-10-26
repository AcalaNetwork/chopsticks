import { DataSource } from 'typeorm'

import * as entities from './entities'
import { retry } from '../retry'

export const openDb = async (dbPath: string): Promise<DataSource> => {
  const source = new DataSource({
    type: 'sqlite',
    database: dbPath,
    entities: Object.values(entities),
    synchronize: true,
    logging: false,
  })

  await retry(() => source.initialize(), 3, 1000)

  return source
}
