import { Column, Entity, PrimaryColumn } from 'typeorm'
import type { Header } from '@polkadot/types/interfaces'
import type { HexString } from '@polkadot/util/types'

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
  hash!: HexString

  @Column()
  number!: number

  @Column({ type: 'simple-json', nullable: true })
  header!: Header

  @Column({ nullable: true })
  parentHash!: HexString

  @Column('simple-array', { nullable: true })
  extrinsics!: HexString[]

  @Column({ nullable: true })
  storageDiff!: Record<HexString, HexString | null>
}
