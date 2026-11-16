import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const require = createRequire(import.meta.url)
const dbRequire = createRequire(require.resolve('@acala-network/chopsticks-db'))

// Keep the application's driver separate from the older driver at the npm consumer's root.
assert.notEqual(dbRequire.resolve('better-sqlite3'), require.resolve('better-sqlite3'))

const directory = await mkdtemp(join(tmpdir(), 'chopsticks-sqlite-'))
try {
  for (const [format, { SqliteDatabase }] of [
    ['esm', await import('@acala-network/chopsticks-db')],
    ['cjs', require('@acala-network/chopsticks-db')],
  ]) {
    const path = join(directory, `${format}.sqlite`)
    const db = new SqliteDatabase(path)
    await db.datasource
    try {
      await db.saveStorage('0x01', '0x02', '0x03')
    } finally {
      await db.close()
    }

    const reopened = new SqliteDatabase(path)
    await reopened.datasource
    try {
      assert.equal((await reopened.queryStorage('0x01', '0x02'))?.value, '0x03')
      console.log(`${format}: SQLite storage persisted across reopening`)
    } finally {
      await reopened.close()
    }
  }
} finally {
  await rm(directory, { recursive: true, force: true })
}
