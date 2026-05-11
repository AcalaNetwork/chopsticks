import type { BlockEntry, Database, KeyValueEntry } from '@acala-network/chopsticks-core'
import type { HexString } from '@polkadot/util/types'
import type { DataSource } from 'typeorm'

import { BlockEntity, KeyValuePair, PagedKeys, RpcCall } from './db/entities.js'

export abstract class BaseSqlDatabase implements Database {
  abstract datasource: Promise<DataSource>

  close = async () => {
    const db = await this.datasource
    await db.destroy()
  }

  async saveBlock(block: BlockEntry) {
    const db = await this.datasource

    const { hash, number, header, extrinsics, parentHash, storageDiff } = block

    await db.transaction(async (transactionalEntityManager) => {
      await transactionalEntityManager.getRepository(BlockEntity).delete({ number })
      await transactionalEntityManager.getRepository(BlockEntity).upsert(
        {
          hash,
          number,
          header,
          extrinsics,
          parentHash,
          storageDiff,
        },
        ['hash'],
      )
    })
  }

  async queryBlock(hash: HexString): Promise<BlockEntry | null> {
    const db = await this.datasource
    return db.getRepository(BlockEntity).findOne({ where: { hash } })
  }

  async queryBlockByNumber(number: number): Promise<BlockEntry | null> {
    const db = await this.datasource
    return db.getRepository(BlockEntity).findOne({ where: { number }, order: { number: 'desc' } })
  }

  async queryHighestBlock(): Promise<BlockEntry | null> {
    const db = await this.datasource
    return db.getRepository(BlockEntity).findOne({ where: {}, order: { number: 'desc' } })
  }

  async deleteBlock(hash: HexString) {
    const db = await this.datasource
    await db.getRepository(BlockEntity).delete({ hash })
  }

  async blocksCount(): Promise<number> {
    const db = await this.datasource
    return db.getRepository(BlockEntity).count()
  }

  async saveStorage(blockHash: HexString, key: HexString, value: HexString | null) {
    const db = await this.datasource
    await db.getRepository(KeyValuePair).upsert(
      {
        blockHash,
        key,
        value,
      },
      ['blockHash', 'key'],
    )
  }

  async saveStorageBatch(entries: KeyValueEntry[]) {
    const db = await this.datasource
    await db.getRepository(KeyValuePair).upsert(entries, ['blockHash', 'key'])
  }

  async queryStorage(blockHash: HexString, key: HexString): Promise<KeyValueEntry | null> {
    const db = await this.datasource
    return db.getRepository(KeyValuePair).findOne({ where: { blockHash, key } })
  }

  async queryPagedKeys(blockHash: HexString, prefix: HexString): Promise<HexString[] | null> {
    const db = await this.datasource
    const row = await db.getRepository(PagedKeys).findOne({ where: { blockHash, prefix } })
    return row ? JSON.parse(row.keys) : null
  }

  async savePagedKeys(blockHash: HexString, prefix: HexString, keys: HexString[]): Promise<void> {
    const db = await this.datasource
    await db.getRepository(PagedKeys).upsert({ blockHash, prefix, keys: JSON.stringify(keys) }, ['blockHash', 'prefix'])
  }

  async queryRpcCall(scope: string, method: string, params: string): Promise<string | null> {
    const db = await this.datasource
    const row = await db.getRepository(RpcCall).findOne({ where: { scope, method, params } })
    return row?.result ?? null
  }

  async saveRpcCall(scope: string, method: string, params: string, result: string): Promise<void> {
    const db = await this.datasource
    await db.getRepository(RpcCall).upsert({ scope, method, params, result }, ['scope', 'method', 'params'])
  }
}
