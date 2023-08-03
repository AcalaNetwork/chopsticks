import { EntitySchema } from 'typeorm'

export const KeyValuePair = new EntitySchema<{
  blockHash: string
  key: string
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
