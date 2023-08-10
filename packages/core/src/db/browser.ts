import { DataSource } from 'typeorm'
import { createInstance } from 'localforage'
import initSqlJs from 'sql.js'

import * as entities from './entities'

export const openDb = async (sqlWasmUrl: URL): Promise<DataSource> => {
  if (!globalThis.localforage) {
    globalThis.localforage = createInstance({ name: 'chopsticks' })
  }
  const wasmBinary = await fetch(sqlWasmUrl).then((response) => response.arrayBuffer())
  const source = new DataSource({
    type: 'sqljs',
    location: 'cache',
    entities: Object.values(entities),
    synchronize: true,
    autoSave: true,
    logging: false,
    useLocalForage: true,
    driver: initSqlJs,
    sqlJsConfig: {
      wasmBinary,
    },
  })

  await source.initialize()

  return source
}
