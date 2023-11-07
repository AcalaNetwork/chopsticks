import { BlockEntry, Database, KeyValueEntry } from '@acala-network/chopsticks-core'
import { DataSource } from 'typeorm'
import { HexString } from '@polkadot/util/types'

import { BlockEntity, KeyValuePair } from './db/entities.js'

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

  async queryStorage(blockHash: HexString, key: HexString): Promise<KeyValueEntry | null> {
    const db = await this.datasource
    return db.getRepository(KeyValuePair).findOne({ where: { blockHash, key } })
  }
}
