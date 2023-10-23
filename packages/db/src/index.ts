import { DataSource } from 'typeorm'

import { BaseSqlDatabase } from './base-sql'
import { openDb } from './db'

export class SqliteDatabase extends BaseSqlDatabase {
  datasource: Promise<DataSource>

  constructor(location: string) {
    super()
    this.datasource = openDb(location)
  }
}
