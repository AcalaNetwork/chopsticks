import { Column, Entity, PrimaryColumn } from 'typeorm'

@Entity()
export class KeyValuePair {
  @PrimaryColumn('text', { nullable: false })
  blockHash!: string

  @PrimaryColumn('text', { nullable: false })
  key!: string

  @Column('text', { nullable: true })
  value!: string
}
