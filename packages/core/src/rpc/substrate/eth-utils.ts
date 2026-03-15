import type { HexString } from '@polkadot/util/types'

import { hexToU8a } from '@polkadot/util'

import type { Block } from '../../blockchain/block.js'
import type { Blockchain } from '../../blockchain/index.js'
import type { Context } from '../shared.js'
import { ResponseError } from '../shared.js'
import { registry } from './frontier-types.js'

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
 * Encode a 20-byte Ethereum address as SCALE-encoded H160.
 */
export function encodeH160(address: string): HexString {
  return registry.createType('H160', address).toHex()
}

/**
 * Encode a 32-byte hash/slot as SCALE-encoded H256.
 */
export function encodeH256(value: string): HexString {
  return registry.createType('H256', value).toHex()
}

/**
 * Decode AccountBasic struct: { nonce: U256, balance: U256 }.
 */
export function decodeAccountBasic(hex: HexString): { nonce: bigint; balance: bigint } {
  const decoded = registry.createType('EvmAccountBasic', hexToU8a(hex))
  return {
    nonce: (decoded as any).nonce.toBigInt(),
    balance: (decoded as any).balance.toBigInt(),
  }
}

/**
 * Decode a u64 from SCALE-encoded little-endian bytes.
 */
export function decodeU64LE(hex: HexString): bigint {
  return registry.createType('u64', hexToU8a(hex)).toBigInt()
}

/**
 * Decode a U256 from SCALE-encoded little-endian bytes.
 */
export function decodeU256LE(hex: string): bigint {
  const input = hex.startsWith('0x') ? hex : '0x' + hex
  return registry.createType('u256', hexToU8a(input)).toBigInt()
}

/**
 * Decode a SCALE-encoded Vec<u8> and return the data as a hex string.
 */
export function decodeVec(hex: string): { data: string } {
  const input = hex.startsWith('0x') ? hex : '0x' + hex
  const decoded = registry.createType('Bytes', hexToU8a(input))
  return { data: decoded.toHex().replace(/^0x/, '') }
}

/**
 * Decode a call result from EthereumRuntimeRPCApi_call (Frontier API v6).
 *
 * The response is Result<ExecutionInfoV2<Vec<u8>>, DispatchError>.
 * We manually check the Result variant byte, then decode ExecutionInfoV2.
 */
export function decodeCallResult(hex: HexString): {
  success: boolean
  returnData: string
  gasUsed: bigint
} {
  const bytes = hexToU8a(hex)

  // Result enum: 0x00 = Ok, 0x01 = Err
  if (bytes[0] !== 0) {
    throw new ResponseError(-32603, 'Runtime call failed: dispatch error')
  }

  // Decode ExecutionInfoV2 from the bytes after the Result variant byte
  const info = registry.createType('EvmExecutionInfoV2', bytes.subarray(1))

  const exitReason = (info as any).exitReason
  const success = exitReason.isSucceed

  return {
    success,
    returnData: (info as any).value.toHex(),
    gasUsed: (info as any).usedGas.effective.toBigInt(),
  }
}

/**
 * Encode parameters for EthereumRuntimeRPCApi_call (Frontier API v6).
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
  const accessList = params.accessList
    ? params.accessList.map((entry) => [entry.address, entry.storageKeys])
    : undefined

  const encoded = registry.createType('EvmCallParams', {
    from: params.from ?? '0x' + '00'.repeat(20),
    to: params.to,
    data: params.data ?? '0x',
    value: params.value ?? 0n,
    gasLimit: params.gasLimit ?? 25000000n,
    maxFeePerGas: params.maxFeePerGas,
    maxPriorityFeePerGas: undefined,
    nonce: undefined,
    estimate: params.estimate ?? false,
    accessList: accessList,
    authorizationList: undefined,
  })

  return encoded.toHex()
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
