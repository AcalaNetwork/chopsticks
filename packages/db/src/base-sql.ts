import { BlockEntry, Database, KeyValueEntry } from '@acala-network/chopsticks-core'
import { DataSource } from 'typeorm'
import { HexString } from '@polkadot/util/types'

import { BlockEntity, KeyValuePair } from './db/entities'

export abstract class BaseSqlDatabase implements Database {
  abstract datasource: Promise<DataSource>

  close = async () => {
    const db = await this.datasource
    await db.destroy()
  }

  saveBlock = async (block: BlockEntry) => {
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

  queryBlock = async (hash: HexString): Promise<BlockEntry | null> => {
    const db = await this.datasource
    return db.getRepository(BlockEntity).findOne({ where: { hash } })
  }

  queryBlockByNumber = async (number: number): Promise<BlockEntry | null> => {
    const db = await this.datasource
    return db.getRepository(BlockEntity).findOne({ where: { number }, order: { number: 'desc' } })
  }

  queryHighestBlock = async (): Promise<BlockEntry | null> => {
    const db = await this.datasource
    return db.getRepository(BlockEntity).findOne({ where: {}, order: { number: 'desc' } })
  }

  deleteBlock = async (hash: HexString) => {
    const db = await this.datasource
    await db.getRepository(BlockEntity).delete({ hash })
  }

  blocksCount = async (): Promise<number> => {
    const db = await this.datasource
    return db.getRepository(BlockEntity).count()
  }

  saveStorage = async (blockHash: HexString, key: HexString, value: HexString | null) => {
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

  queryStorage = async (blockHash: HexString, key: HexString): Promise<KeyValueEntry | null> => {
    const db = await this.datasource
    return db.getRepository(KeyValuePair).findOne({ where: { blockHash, key } })
  }
}
