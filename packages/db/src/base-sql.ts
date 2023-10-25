import { BlockEntry, Database, KeyValueEntry, defaultLogger } from '@acala-network/chopsticks-core'
import { DataSource, QueryFailedError } from 'typeorm'
import { HexString } from '@polkadot/util/types'

import { BlockEntity, KeyValuePair } from './db/entities'

const logger = defaultLogger.child({ name: 'base-sql' })

function Retryable<T>(
  _target: any,
  _propertyKey: string,
  descriptor: TypedPropertyDescriptor<(...args: any[]) => Promise<T>>,
) {
  const originalMethod = descriptor.value

  descriptor.value = async function (...args: any[]): Promise<T> {
    return retry(() => originalMethod!.apply(this, args))
  }

  return descriptor
}

export async function retry<T>(fn: () => Promise<T>, maxRetries: number = 3, delay: number = 500): Promise<T> {
  let retries = 0
  while (retries < maxRetries) {
    try {
      return await fn()
    } catch (error) {
      if (error instanceof QueryFailedError) {
        if (error.message.includes('SQLITE_BUSY')) {
          retries++
          logger.info(`SQLite is busy. Retrying in ${delay}ms (Attempt ${retries})...`)
          await new Promise((r) => setTimeout(r, delay))
        } else {
          throw error
        }
      } else {
        throw error
      }
    }
  }
  throw new Error(`Exceeded maximum retries (${maxRetries}) for SQLite busy error.`)
}

export abstract class BaseSqlDatabase implements Database {
  abstract datasource: Promise<DataSource>

  close = async () => {
    const db = await this.datasource
    await db.destroy()
  }

  @Retryable
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

  @Retryable
  async queryBlock(hash: HexString): Promise<BlockEntry | null> {
    const db = await this.datasource
    return db.getRepository(BlockEntity).findOne({ where: { hash } })
  }

  @Retryable
  async queryBlockByNumber(number: number): Promise<BlockEntry | null> {
    const db = await this.datasource
    return db.getRepository(BlockEntity).findOne({ where: { number }, order: { number: 'desc' } })
  }

  @Retryable
  async queryHighestBlock(): Promise<BlockEntry | null> {
    const db = await this.datasource
    return db.getRepository(BlockEntity).findOne({ where: {}, order: { number: 'desc' } })
  }

  @Retryable
  async deleteBlock(hash: HexString) {
    const db = await this.datasource
    await db.getRepository(BlockEntity).delete({ hash })
  }

  @Retryable
  async blocksCount(): Promise<number> {
    const db = await this.datasource
    return db.getRepository(BlockEntity).count()
  }

  @Retryable
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

  @Retryable
  async queryStorage(blockHash: HexString, key: HexString): Promise<KeyValueEntry | null> {
    const db = await this.datasource
    return db.getRepository(KeyValuePair).findOne({ where: { blockHash, key } })
  }
}
