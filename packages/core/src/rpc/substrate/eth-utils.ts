import type { HexString } from '@polkadot/util/types'

import type { Block } from '../../blockchain/block.js'
import type { Blockchain } from '../../blockchain/index.js'
import type { Context } from '../shared.js'
import { ResponseError } from '../shared.js'

/**
 * Convert a bigint to a minimal Ethereum hex quantity string (no leading zeros).
 * E.g. 0n → "0x0", 255n → "0xff"
 */
export function toEthQuantity(n: bigint): string {
  if (n === 0n) return '0x0'
  return '0x' + n.toString(16)
}

/**
 * Parse an Ethereum hex quantity string to bigint.
 */
export function fromEthQuantity(hex: string): bigint {
  return BigInt(hex)
}

/**
 * Encode a 20-byte Ethereum address as a hex string (no length prefix).
 */
export function encodeH160(address: string): HexString {
  const clean = address.toLowerCase().replace(/^0x/, '')
  if (clean.length !== 40) {
    throw new ResponseError(-32602, `Invalid address: expected 20 bytes, got ${clean.length / 2}`)
  }
  return ('0x' + clean) as HexString
}

/**
 * Encode a 32-byte hash/slot as a hex string (no length prefix).
 */
export function encodeH256(value: string): HexString {
  const clean = value.toLowerCase().replace(/^0x/, '')
  if (clean.length !== 64) {
    throw new ResponseError(-32602, `Invalid H256: expected 32 bytes, got ${clean.length / 2}`)
  }
  return ('0x' + clean) as HexString
}

/**
 * Encode a bigint as a 32-byte little-endian U256 hex string.
 */
export function encodeU256(value: bigint): HexString {
  const bytes = new Uint8Array(32)
  let v = value
  for (let i = 0; i < 32; i++) {
    bytes[i] = Number(v & 0xffn)
    v >>= 8n
  }
  return ('0x' + Buffer.from(bytes).toString('hex')) as HexString
}

/**
 * Decode 8 bytes little-endian to a bigint (u64).
 */
export function decodeU64LE(hex: HexString): bigint {
  const clean = hex.replace(/^0x/, '')
  let result = 0n
  const len = Math.min(clean.length, 16)
  for (let i = 0; i < len; i += 2) {
    const byte = BigInt(parseInt(clean.slice(i, i + 2), 16))
    result |= byte << (BigInt(i / 2) * 8n)
  }
  return result
}

/**
 * Decode 32 bytes little-endian to a bigint (U256).
 */
export function decodeU256LE(hex: string, offset = 0): bigint {
  const clean = hex.replace(/^0x/, '')
  const start = offset * 2
  let result = 0n
  for (let i = 0; i < 64; i += 2) {
    const byte = BigInt(parseInt(clean.slice(start + i, start + i + 2), 16))
    result |= byte << (BigInt(i / 2) * 8n)
  }
  return result
}

/**
 * Decode AccountBasic struct: first 32 bytes = nonce (U256 LE), next 32 bytes = balance (U256 LE).
 */
export function decodeAccountBasic(hex: HexString): { nonce: bigint; balance: bigint } {
  const clean = hex.replace(/^0x/, '')
  const nonce = decodeU256LE(clean, 0)
  const balance = decodeU256LE(clean, 32)
  return { nonce, balance }
}

/**
 * Decode a SCALE-encoded Vec<u8> at a given byte offset.
 * Returns the data as a hex string and the total number of bytes consumed.
 */
export function decodeVec(hex: string, byteOffset = 0): { data: string; bytesRead: number } {
  const clean = hex.replace(/^0x/, '')
  let pos = byteOffset * 2

  // Decode SCALE compact length
  const firstByte = parseInt(clean.slice(pos, pos + 2), 16)
  const mode = firstByte & 0x03
  let length: number
  let headerSize: number

  if (mode === 0) {
    length = firstByte >> 2
    headerSize = 1
  } else if (mode === 1) {
    const secondByte = parseInt(clean.slice(pos + 2, pos + 4), 16)
    length = ((secondByte << 8) | firstByte) >> 2
    headerSize = 2
  } else if (mode === 2) {
    let val = 0
    for (let i = 0; i < 4; i++) {
      val |= parseInt(clean.slice(pos + i * 2, pos + i * 2 + 2), 16) << (i * 8)
    }
    length = val >> 2
    headerSize = 4
  } else {
    const upperBits = firstByte >> 2
    const bytesNeeded = upperBits + 4
    let val = 0n
    for (let i = 0; i < bytesNeeded; i++) {
      val |= BigInt(parseInt(clean.slice(pos + 2 + i * 2, pos + 4 + i * 2), 16)) << (BigInt(i) * 8n)
    }
    length = Number(val)
    headerSize = 1 + bytesNeeded
  }

  pos += headerSize * 2
  const data = clean.slice(pos, pos + length * 2)
  return { data, bytesRead: headerSize + length }
}

/**
 * SCALE-encode a Vec<u8> from raw bytes (hex without 0x prefix).
 */
export function encodeVec(hexBytes: string): string {
  const length = hexBytes.length / 2
  return encodeCompact(length) + hexBytes
}

/**
 * SCALE compact encoding of a non-negative integer.
 */
export function encodeCompact(value: number): string {
  if (value < 64) {
    return (value << 2).toString(16).padStart(2, '0')
  } else if (value < 16384) {
    const v = (value << 2) | 1
    return v.toString(16).padStart(4, '0').match(/../g)!.reverse().join('')
  } else if (value < 1073741824) {
    const v = (value << 2) | 2
    return v.toString(16).padStart(8, '0').match(/../g)!.reverse().join('')
  } else {
    throw new ResponseError(-32603, 'Compact encoding for values >= 2^30 not implemented')
  }
}

/**
 * Decode a call result from EthereumRuntimeRPCApi_call (Frontier API v6).
 *
 * Returns Result<ExecutionInfoV2<Vec<u8>>, DispatchError>
 *
 * ExecutionInfoV2<Vec<u8>> = {
 *   exit_reason: ExitReason,   // enum: 0=Succeed, 1=Error, 2=Revert, 3=Fatal; each wraps a sub-enum (1 byte)
 *   value: Vec<u8>,            // return data
 *   used_gas: UsedGas,         // { standard: U256, effective: U256 }
 *   weight_info: Option<WeightInfo>,
 *   logs: Vec<Log>,
 * }
 */
export function decodeCallResult(hex: HexString): {
  success: boolean
  returnData: string
  gasUsed: bigint
} {
  const clean = hex.replace(/^0x/, '')

  // Result enum: 0x00 = Ok, 0x01 = Err
  const resultVariant = parseInt(clean.slice(0, 2), 16)
  if (resultVariant !== 0) {
    throw new ResponseError(-32603, 'Runtime call failed: dispatch error')
  }

  // ExitReason: 1 byte category + 1 byte sub-reason
  const exitCategory = parseInt(clean.slice(2, 4), 16)
  // skip sub-reason byte
  let byteOffset = 3

  // Decode return data Vec<u8>
  const vec = decodeVec(clean, byteOffset)
  byteOffset += vec.bytesRead

  // UsedGas: { standard: U256 (32 bytes LE), effective: U256 (32 bytes LE) }
  // Skip standard gas
  byteOffset += 32
  const effectiveGas = decodeU256LE(clean, byteOffset)

  // ExitReason category 0 = Succeed
  const success = exitCategory === 0

  return {
    success,
    returnData: '0x' + vec.data,
    gasUsed: effectiveGas,
  }
}

/**
 * Encode parameters for EthereumRuntimeRPCApi_call (Frontier API v6).
 *
 * fn call(from: H160, to: H160, data: Vec<u8>, value: U256, gas_limit: U256,
 *         max_fee_per_gas: Option<U256>, max_priority_fee_per_gas: Option<U256>,
 *         nonce: Option<u32>, estimate: bool,
 *         access_list: Option<Vec<(H160, Vec<H256>)>>,
 *         authorization_list: Option<AuthorizationList>)
 */
export function encodeCallParams(params: {
  from?: string
  to: string
  data?: string
  value?: bigint
  gasLimit?: bigint
  maxFeePerGas?: bigint
  accessList?: Array<{ address: string; storageKeys: string[] }>
  estimate?: boolean
}): HexString {
  let encoded = ''

  // from: H160 (20 bytes)
  const from = params.from ? params.from.replace(/^0x/, '').padStart(40, '0') : '0'.repeat(40)
  encoded += from

  // to: H160 (20 bytes)
  encoded += params.to.replace(/^0x/, '').padStart(40, '0')

  // data: Vec<u8>
  const data = params.data ? params.data.replace(/^0x/, '') : ''
  encoded += encodeVec(data)

  // value: U256 LE (32 bytes)
  encoded += encodeU256(params.value ?? 0n).replace(/^0x/, '')

  // gas_limit: U256 LE (32 bytes)
  encoded += encodeU256(params.gasLimit ?? 25000000n).replace(/^0x/, '')

  // max_fee_per_gas: Option<U256> - None
  if (params.maxFeePerGas !== undefined) {
    encoded += '01' + encodeU256(params.maxFeePerGas).replace(/^0x/, '')
  } else {
    encoded += '00'
  }

  // max_priority_fee_per_gas: Option<U256> - None
  encoded += '00'

  // nonce: Option<u32> - None (v6 uses u32, not U256)
  encoded += '00'

  // estimate: bool
  encoded += params.estimate ? '01' : '00'

  // access_list: Option<Vec<(H160, Vec<H256>)>>
  if (params.accessList && params.accessList.length > 0) {
    encoded += '01'
    encoded += encodeCompact(params.accessList.length)
    for (const entry of params.accessList) {
      encoded += entry.address.replace(/^0x/, '').padStart(40, '0')
      encoded += encodeCompact(entry.storageKeys.length)
      for (const key of entry.storageKeys) {
        encoded += key.replace(/^0x/, '').padStart(64, '0')
      }
    }
  } else {
    encoded += '00'
  }

  // authorization_list: Option<AuthorizationList> - None (v6 addition)
  encoded += '00'

  return ('0x' + encoded) as HexString
}

/**
 * Resolve an Ethereum block tag ("latest", "earliest", "pending", or hex number) to a Block.
 */
export async function resolveBlock(context: Context, blockTag?: string): Promise<Block> {
  if (!blockTag || blockTag === 'latest' || blockTag === 'pending') {
    return context.chain.head
  }

  if (blockTag === 'earliest') {
    const block = await (context.chain as Blockchain).getBlockAt(0)
    if (!block) {
      throw new ResponseError(-32602, 'Earliest block not found')
    }
    return block
  }

  // Hex block number
  const blockNumber = Number(BigInt(blockTag))
  const block = await (context.chain as Blockchain).getBlockAt(blockNumber)
  if (!block) {
    throw new ResponseError(-32602, `Block ${blockTag} not found`)
  }
  return block
}
