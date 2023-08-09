import { DataSource } from 'typeorm'
import { createInstance } from 'localforage'
import initSqlJs from 'sql.js'

import * as entities from './entities'

export const openDb = async (dbPath: string): Promise<DataSource> => {
  if (!globalThis.localforage) {
    globalThis.localforage = createInstance({ name: 'chopsticks' })
  }
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  const wasmUrl = new URL('../../../../node_modules/sql.js/dist/sql-wasm.wasm', import.meta.url)
  const wasmBinary = await fetch(wasmUrl).then((response) => response.arrayBuffer())
  const source = new DataSource({
    type: 'sqljs',
    location: dbPath,
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
