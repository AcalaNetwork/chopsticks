import { HexString } from '@polkadot/util/types'
import { HrmpChannelId } from '@polkadot/types/interfaces'
import { hexToU8a, u8aConcat, u8aToHex } from '@polkadot/util'
import { u32 } from '@polkadot/types'
import { xxhashAsU8a } from '@polkadot/util-crypto'

export const WELL_KNOWN_KEYS = {
  EPOCH_INDEX: '0x1cb6f36e027abb2091cfb5110ab5087f38316cbf8fa0da822a20ac1c55bf1be3' as HexString,
  CURRENT_BLOCK_RANDOMNESS: '0x1cb6f36e027abb2091cfb5110ab5087fd077dfdb8adb10f78f10a5df8742c545' as HexString,
  ONE_EPOCH_AGO_RANDOMNESS: '0x1cb6f36e027abb2091cfb5110ab5087f7ce678799d3eff024253b90e84927cc6' as HexString,
  TWO_EPOCHS_AGO_RANDOMNESS: '0x1cb6f36e027abb2091cfb5110ab5087f7a414cb008e0e61e46722aa60abdd672' as HexString,
  CURRENT_SLOT: '0x1cb6f36e027abb2091cfb5110ab5087f06155b3cd9a8c9e5e9a23fd5dc13a5ed' as HexString,
  ACTIVE_CONFIG: '0x06de3d8a54d27e44a9d5ce189618f22db4b49d95320d9021994c850f25b8e385' as HexString,
}

const hash = (prefix: HexString, suffix: Uint8Array) => {
  return u8aToHex(u8aConcat(hexToU8a(prefix), xxhashAsU8a(suffix, 64), suffix))
}

export const dmqMqcHead = (paraId: u32) => {
  const prefix = '0x63f78c98723ddc9073523ef3beefda0c4d7fefc408aac59dbfe80a72ac8e3ce5'
  return hash(prefix, paraId.toU8a())
}

export const upgradeGoAheadSignal = (paraId: u32) => {
  const prefix = '0xcd710b30bd2eab0352ddcc26417aa1949e94c040f5e73d9b7addd6cb603d15d3'
  return hash(prefix, paraId.toU8a())
}

export const hrmpIngressChannelIndex = (paraId: u32) => {
  const prefix = '0x6a0da05ca59913bc38a8630590f2627c1d3719f5b0b12c7105c073c507445948'
  return hash(prefix, paraId.toU8a())
}

export const hrmpEgressChannelIndex = (paraId: u32) => {
  const prefix = '0x6a0da05ca59913bc38a8630590f2627cf12b746dcf32e843354583c9702cc020'
  return hash(prefix, paraId.toU8a())
}

export const hrmpChannels = (channelId: HrmpChannelId) => {
  const prefix = '0x6a0da05ca59913bc38a8630590f2627cb6604cff828a6e3f579ca6c59ace013d'
  return hash(prefix, channelId.toU8a())
}

export const paraHead = (paraId: u32) => {
  const prefix = '0xcd710b30bd2eab0352ddcc26417aa1941b3c252fcb29d88eff4f3de5de4476c3'
  return hash(prefix, paraId.toU8a())
}
