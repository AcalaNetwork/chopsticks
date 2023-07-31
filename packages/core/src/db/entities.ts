import { EntitySchema } from 'typeorm'

export const KeyValuePair = new EntitySchema({
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
