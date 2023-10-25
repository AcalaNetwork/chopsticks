import { BlockEntry, KeyValueEntry } from '@acala-network/chopsticks-core'
import { EntitySchema } from 'typeorm'

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
