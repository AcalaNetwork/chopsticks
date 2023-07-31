import initSqlJs from 'sql.js'
import { DataSource } from 'typeorm'

import * as entities from './entities'

// TODO: make sure this works in bundlers
export const openDb = async (dbPath: string): Promise<DataSource> => {
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
      wasmBinary
    },
  })

  await source.initialize()

  return source
}
