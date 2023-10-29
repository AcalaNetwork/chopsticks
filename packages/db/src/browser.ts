import { BlockEntry, Database, KeyValueEntry } from '@acala-network/chopsticks-core'
import { DBSchema, IDBPDatabase, openDB } from 'idb'

interface Schema extends DBSchema {
  keyValue: {
    key: string
    value: string | null
  }
  block: {
    key: string
    value: BlockEntry
    indexes: { byNumber: number }
  }
}
export class IdbDatabase implements Database {
  datasource: Promise<IDBPDatabase<Schema>>

  constructor(location: string) {
    this.datasource = openDB<Schema>(location, 1, {
      upgrade(db) {
        db.createObjectStore('keyValue')
        const blockStore = db.createObjectStore('block', { keyPath: 'hash' })
        blockStore.createIndex('byNumber', 'number')
      },
    })
  }

  async close(): Promise<void> {
    const db = await this.datasource
    db.close()
  }

  async saveBlock(block: BlockEntry): Promise<void> {
    const db = await this.datasource
    const tx = db.transaction(['block'], 'readwrite')
    const store = tx.objectStore('block')
    store.delete(block.hash)
    store.put(block)
    await tx.done
  }

  async queryBlock(hash: `0x${string}`): Promise<BlockEntry | null> {
    const db = await this.datasource
    const block = await db.get('block', hash)
    return block ?? null
  }

  async queryBlockByNumber(number: number): Promise<BlockEntry | null> {
    const db = await this.datasource
    const block = await db.getFromIndex('block', 'byNumber', number)
    return block ?? null
  }

  async queryHighestBlock(): Promise<BlockEntry | null> {
    const db = await this.datasource
    const index = db.transaction('block').store.index('byNumber')
    const cursor = await index.openCursor(null, 'prev')
    return cursor?.value ?? null
  }

  async deleteBlock(hash: `0x${string}`): Promise<void> {
    const db = await this.datasource
    await db.delete('block', hash)
  }

  async blocksCount(): Promise<number> {
    const db = await this.datasource
    return db.count('block')
  }

  async saveStorage(blockHash: `0x${string}`, key: `0x${string}`, value: `0x${string}` | null): Promise<void> {
    const db = await this.datasource
    await db.put('keyValue', value, `${blockHash}-${key}`)
  }

  async queryStorage(blockHash: `0x${string}`, key: `0x${string}`): Promise<KeyValueEntry | null> {
    const db = await this.datasource
    const value = await db.get('keyValue', `${blockHash}-${key}`)
    return value !== undefined ? { blockHash, key, value } : null
  }
}
