import { DataSource } from 'typeorm'
import { createInstance } from 'localforage'
import initSqlJs from 'sql.js'

import * as entities from './entities'
import { SQL_WASM_BYTES } from './sql-wasm'

export const openDb = async (location: string): Promise<DataSource> => {
  if (!globalThis.localforage) {
    globalThis.localforage = createInstance({ name: 'chopsticks' })
  }
  const source = new DataSource({
    type: 'sqljs',
    location,
    entities: Object.values(entities),
    synchronize: true,
    autoSave: true,
    logging: false,
    useLocalForage: true,
    driver: initSqlJs,
    sqlJsConfig: {
      wasmBinary: SQL_WASM_BYTES,
    },
  })

  await source.initialize()

  return source
}
