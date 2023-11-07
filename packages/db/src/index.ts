import { DataSource } from 'typeorm'

import { BaseSqlDatabase } from './base-sql.js'
import { openDb } from './db/index.js'

export class SqliteDatabase extends BaseSqlDatabase {
  datasource: Promise<DataSource>

  constructor(location: string) {
    super()
    this.datasource = openDb(location)
  }
}
