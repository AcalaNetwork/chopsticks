import { EntitySchema } from 'typeorm'
import { HexString } from '@polkadot/util/types'

export const KeyValuePair = new EntitySchema<{
  blockHash: HexString
  key: HexString
  value?: string
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
