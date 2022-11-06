import { Column, Entity, PrimaryColumn } from 'typeorm'

@Entity()
export class KeyValuePair {
  @PrimaryColumn()
  blockHash!: string

  @PrimaryColumn()
  key!: string

  @Column({ nullable: true })
  value!: string
}
