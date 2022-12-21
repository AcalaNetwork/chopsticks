import { BlockNumber, H256, H512, Header as HeaderBase } from '@polkadot/types/interfaces'
import { Struct } from '@polkadot/types-codec'

export interface ShufflingSeed extends Struct {
  readonly seed: H256;
  readonly proof: H512;
}

export interface HeaderVer extends HeaderBase {
  readonly seed: ShufflingSeed;
  readonly count: BlockNumber;
}

export const RegistryTypes = {
  types: {
    ShufflingSeed: {
      seed: 'H256',
      proof: 'H512'
    },
    Header: {
      parentHash: 'Hash',
      number: 'Compact<BlockNumber>',
      stateRoot: 'Hash',
      extrinsicsRoot: 'Hash',
      digest: 'Digest',
      seed: 'ShufflingSeed',
      count: 'BlockNumber'
    }
  }
}

export type Header = HeaderVer
