import { HexString } from '@polkadot/util/types'

export interface BlockEntry {
  hash: HexString
  number: number
  header: HexString
  parentHash: HexString | null
  extrinsics: HexString[]
  storageDiff: Record<HexString, HexString | null> | null
}

export interface KeyValueEntry {
  blockHash: string
  key: string
  value: string | null
}

export declare class Database {
  constructor(location: string)
  close: () => Promise<void>
  saveBlock: (block: BlockEntry) => Promise<void>
  queryBlock: (hash: HexString) => Promise<BlockEntry | null>
  queryBlockByNumber: (number: number) => Promise<BlockEntry | null>
  queryHighestBlock: () => Promise<BlockEntry | null>
  deleteBlock: (hash: HexString) => Promise<void>
  blocksCount: () => Promise<number>
  saveStorage: (blockHash: HexString, key: HexString, value: HexString | null) => Promise<void>
  queryStorage: (blockHash: HexString, key: HexString) => Promise<KeyValueEntry | null>
}
