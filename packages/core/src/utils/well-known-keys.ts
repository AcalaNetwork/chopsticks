import { HexString } from '@polkadot/util/types'
import { Registry } from '@polkadot/types-codec/types'
import { blake2AsHex } from '@polkadot/util-crypto'
import { hexToU8a, stringToHex } from '@polkadot/util'

const decodeValue = (type: string) => (registry: Registry, value: HexString) => {
  return registry.createType(type, hexToU8a(value)).toJSON()
}

// https://github.com/paritytech/polkadot-sdk/issues/2126
const wellKnownKeys = [
  {
    name: 'code',
    key: ':code',
    decodeValue: (_registry: Registry, value: HexString) => {
      return `<:code blake2_256 ${blake2AsHex(value, 256)} (${value.length / 2 - 1} bytes)>`
    },
  },
  {
    name: 'heapPages',
    key: ':heappages',
    type: 'u64',
  },
  {
    name: 'extrinsicIndex',
    key: ':extrinsic_index',
    type: 'u32',
  },
  {
    name: 'intrablockEntropy',
    key: ':intrablock_entropy',
    type: '[u8; 32]',
  },
  {
    name: 'transactionLevel',
    key: ':transaction_level:',
    type: 'u32',
  },
  {
    name: 'grandpaAuthorities',
    key: ':grandpa_authorities',
    type: '(u8, AuthorityList)',
  },
  {
    name: 'relayDispatchQueueRemainingCapacity',
    prefix: ':relay_dispatch_queue_remaining_capacity',
    decodeKey: (registry: Registry, key: HexString) => {
      return [registry.createType('u32', hexToU8a(key)).toJSON()]
    },
    type: '(u32, u32)',
  },
].map((def) => {
  const prefix = stringToHex(def.prefix || def.key)
  return {
    name: def.name,
    prefix,
    decodeKey: def.decodeKey || ((_registry: Registry, key: HexString) => [key]),
    decodeValue: def.decodeValue || decodeValue(def.type),
  }
})

export const decodeWellKnownKey = (registry: Registry, key: HexString, value?: HexString | null) => {
  for (const defs of wellKnownKeys) {
    if (key.startsWith(defs.prefix)) {
      const remaining = key.slice(defs.prefix.length)
      const decodedKey = remaining ? defs.decodeKey(registry, `0x${remaining}`) : undefined
      const decodedValue = value ? defs.decodeValue(registry, value) : undefined
      return {
        name: defs.name,
        key: decodedKey ?? [],
        value: decodedValue,
      }
    }
  }
}
