import { Column, Entity, PrimaryColumn } from 'typeorm'
import { Header } from '@polkadot/types/interfaces'

@Entity()
export class KeyValuePair {
  @PrimaryColumn()
  blockHash!: string

  @PrimaryColumn()
  key!: string

  @Column({ nullable: true })
  value!: string
}

@Entity()
export class Block {
  @PrimaryColumn()
  hash!: string

  @Column()
  number!: number

  @Column({ type: 'simple-json', nullable: true })
  header!: Header

  @Column({ nullable: true })
  parentHash!: string

  @Column('simple-array', { nullable: true })
  extrinsics!: string[]
}
