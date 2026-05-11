import type { BlockEntry, KeyValueEntry } from '@acala-network/chopsticks-core'
import { EntitySchema } from 'typeorm'

export type PagedKeysEntry = {
  blockHash: string
  prefix: string
  keys: string
}

export type RpcCallEntry = {
  scope: string
  method: string
  params: string
  result: string
}

export const KeyValuePair = new EntitySchema<KeyValueEntry>({
  name: 'KeyValuePair',
  columns: {
    blockHash: {
      primary: true,
      type: 'varchar',
      nullable: false,
    },
    key: {
      primary: true,
      type: 'varchar',
      nullable: false,
    },
    value: {
      type: 'text',
      nullable: true,
    },
  },
})

export const BlockEntity = new EntitySchema<BlockEntry>({
  name: 'Block',
  columns: {
    hash: {
      primary: true,
      type: 'varchar',
      nullable: false,
    },
    number: {
      type: 'int',
      nullable: false,
    },
    header: {
      type: 'text',
      nullable: false,
    },
    parentHash: {
      type: 'varchar',
      nullable: true,
    },
    extrinsics: {
      type: 'simple-array',
      nullable: false,
    },
    storageDiff: {
      type: 'simple-json',
      nullable: true,
    },
  },
})

export const PagedKeys = new EntitySchema<PagedKeysEntry>({
  name: 'PagedKeys',
  columns: {
    blockHash: {
      primary: true,
      type: 'varchar',
      nullable: false,
    },
    prefix: {
      primary: true,
      type: 'varchar',
      nullable: false,
    },
    keys: {
      type: 'text',
      nullable: false,
    },
  },
})

export const RpcCall = new EntitySchema<RpcCallEntry>({
  name: 'RpcCall',
  columns: {
    scope: {
      primary: true,
      type: 'varchar',
      nullable: false,
    },
    method: {
      primary: true,
      type: 'varchar',
      nullable: false,
    },
    params: {
      primary: true,
      type: 'varchar',
      nullable: false,
    },
    result: {
      type: 'text',
      nullable: false,
    },
  },
})
