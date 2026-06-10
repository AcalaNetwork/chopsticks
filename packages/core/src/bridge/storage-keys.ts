// Storage keys + value encoders for `pallet_bridge_parachains` and `pallet_bridge_messages`.
// Pallet names are parameters because each runtime instantiates them under different names
// (e.g. `BridgeKusamaMessages` on BHP, `BridgePolkadotMessages` on BHK).

import { compactToU8a, nToU8a, stringToU8a, u8aConcat, u8aToHex } from '@polkadot/util'
import type { HexString } from '@polkadot/util/types'
import { blake2AsU8a, xxhashAsU8a } from '@polkadot/util-crypto'

const u32LE = (v: number): Uint8Array => nToU8a(v, { bitLength: 32, isLe: true })
const u64LE = (v: bigint): Uint8Array => nToU8a(v, { bitLength: 64, isLe: true })

const palletPrefix = (palletName: string, itemName: string): Uint8Array =>
  u8aConcat(xxhashAsU8a(stringToU8a(palletName), 128), xxhashAsU8a(stringToU8a(itemName), 128))

const blake2_128Concat = (data: Uint8Array): Uint8Array => u8aConcat(blake2AsU8a(data, 128), data)
const twox64Concat = (data: Uint8Array): Uint8Array => u8aConcat(xxhashAsU8a(data, 64), data)

const requireBytes = (label: string, b: Uint8Array, len: number): void => {
  if (b.length !== len) throw new Error(`${label} must be ${len} bytes, got ${b.length}`)
}

// pallet_bridge_parachains

export const parasInfoStorageKey = (palletName: string, paraId: number): HexString =>
  u8aToHex(u8aConcat(palletPrefix(palletName, 'ParasInfo'), blake2_128Concat(u32LE(paraId))))

export const importedParaHeadsStorageKey = (palletName: string, paraId: number, headHash: Uint8Array): HexString => {
  requireBytes('headHash', headHash, 32)
  return u8aToHex(
    u8aConcat(
      palletPrefix(palletName, 'ImportedParaHeads'),
      blake2_128Concat(u32LE(paraId)),
      blake2_128Concat(headHash),
    ),
  )
}

export const importedParaHashesStorageKey = (palletName: string, paraId: number, ringIndex: number): HexString =>
  u8aToHex(
    u8aConcat(
      palletPrefix(palletName, 'ImportedParaHashes'),
      blake2_128Concat(u32LE(paraId)),
      twox64Concat(u32LE(ringIndex)),
    ),
  )

// pallet_bridge_messages

export const outboundLanesStorageKey = (palletName: string, lane: Uint8Array): HexString =>
  u8aToHex(u8aConcat(palletPrefix(palletName, 'OutboundLanes'), blake2_128Concat(lane)))

export const inboundLanesStorageKey = (palletName: string, lane: Uint8Array): HexString =>
  u8aToHex(u8aConcat(palletPrefix(palletName, 'InboundLanes'), blake2_128Concat(lane)))

export const outboundLanesPrefix = (palletName: string): HexString =>
  u8aToHex(palletPrefix(palletName, 'OutboundLanes'))

/** Key for `OutboundMessages[MessageKey { lane_id, nonce }]`. `MessageKey` SCALEs to `lane || u64_le(nonce)`. */
export const outboundMessagesStorageKey = (palletName: string, lane: Uint8Array, nonce: bigint): HexString => {
  const messageKey = u8aConcat(lane, u64LE(nonce))
  return u8aToHex(u8aConcat(palletPrefix(palletName, 'OutboundMessages'), blake2_128Concat(messageKey)))
}

// Value encoders

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
  const inner = u8aConcat(u32LE(blockNumber), stateRoot)
  return u8aToHex(u8aConcat(compactToU8a(inner.length), inner))
}

export const encodeHash32 = (hash: Uint8Array): HexString => {
  requireBytes('hash', hash, 32)
  return u8aToHex(hash)
}
