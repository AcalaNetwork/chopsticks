// Value encoders for `pallet_bridge_parachains` storage items. The bridge connector forges
// these values via `dev_setStorage`, so they're SCALE-encoded by hand — runtime metadata
// describes their types but can't construct them. Storage *keys*, by contrast, are derived
// from metadata by the callers (`api.query[pallet].item.key(...)`), never hand-hashed.

import { compactAddLength, nToU8a, u8aConcat, u8aToHex } from '@polkadot/util'
import type { HexString } from '@polkadot/util/types'

const u32LE = (v: number): Uint8Array => nToU8a(v, { bitLength: 32, isLe: true })

const requireBytes = (label: string, b: Uint8Array, len: number): void => {
  if (b.length !== len) throw new Error(`${label} must be ${len} bytes, got ${b.length}`)
}

/** `ParaInfo { best_head_hash: { at_relay_block_number: u32, head_hash: H256 }, next_imported_hash_position: u32 }` */
export const encodeParaInfo = (
  atRelayBlockNumber: number,
  headHash: Uint8Array,
  nextImportedHashPosition: number,
): HexString => {
  requireBytes('headHash', headHash, 32)
  return u8aToHex(u8aConcat(u32LE(atRelayBlockNumber), headHash, u32LE(nextImportedHashPosition)))
}

/** `ParaStoredHeaderData(Vec<u8>)` wrapping SCALE-encoded `StoredHeaderData { number: u32, state_root: H256 }`. */
export const encodeParaStoredHeaderData = (blockNumber: number, stateRoot: Uint8Array): HexString => {
  requireBytes('stateRoot', stateRoot, 32)
  return u8aToHex(compactAddLength(u8aConcat(u32LE(blockNumber), stateRoot)))
}
