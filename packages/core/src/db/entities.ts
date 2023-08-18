import { EntitySchema } from 'typeorm'
import { Header } from '@polkadot/types/interfaces'
import { HexString } from '@polkadot/util/types'

export const KeyValuePair = new EntitySchema<{
  blockHash: string
  key: string
  value: string | null
}>({
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

export const BlockEntity = new EntitySchema<{
  hash: HexString
  number: number
  header: Header
  parentHash: HexString | null
  extrinsics: HexString[]
  storageDiff: Record<HexString, HexString | null> | null
}>({
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
      type: 'simple-json',
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
