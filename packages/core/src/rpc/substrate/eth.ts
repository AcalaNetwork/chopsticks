import type { HexString } from '@polkadot/util/types'

import type { Handler } from '../shared.js'
import { ResponseError } from '../shared.js'
import {
  decodeAccountBasic,
  decodeCallResult,
  decodeU64LE,
  decodeU256LE,
  decodeVec,
  encodeCallParams,
  encodeH160,
  encodeH256,
  resolveBlock,
  toEthQuantity,
} from './eth-utils.js'

/**
 * Returns the chain ID used for signing replay-protected transactions.
 */
export const eth_chainId: Handler<[], string> = async (context) => {
  const block = context.chain.head
  const result = await block.call('EthereumRuntimeRPCApi_chain_id', ['0x'])
  return toEthQuantity(decodeU64LE(result.result as HexString))
}

/**
 * Returns the number of the most recent block.
 */
export const eth_blockNumber: Handler<[], string> = async (context) => {
  const block = context.chain.head
  return toEthQuantity(BigInt(block.number))
}

/**
 * Returns the balance of the account at the given address.
 */
export const eth_getBalance: Handler<[string, string?], string> = async (context, [address, blockTag]) => {
  const block = await resolveBlock(context, blockTag)
  const params = encodeH160(address)
  const result = await block.call('EthereumRuntimeRPCApi_account_basic', [params])
  const { balance } = decodeAccountBasic(result.result as HexString)
  return toEthQuantity(balance)
}

/**
 * Returns the number of transactions sent from an address.
 */
export const eth_getTransactionCount: Handler<[string, string?], string> = async (context, [address, blockTag]) => {
  const block = await resolveBlock(context, blockTag)
  const params = encodeH160(address)
  const result = await block.call('EthereumRuntimeRPCApi_account_basic', [params])
  const { nonce } = decodeAccountBasic(result.result as HexString)
  return toEthQuantity(nonce)
}

/**
 * Returns the code at a given address.
 */
export const eth_getCode: Handler<[string, string?], string> = async (context, [address, blockTag]) => {
  const block = await resolveBlock(context, blockTag)
  const params = encodeH160(address)
  const result = await block.call('EthereumRuntimeRPCApi_account_code_at', [params])
  // Result is a Vec<u8>
  const vec = decodeVec(result.result as string)
  return '0x' + vec.data
}

/**
 * Returns the value from a storage position at a given address.
 */
export const eth_getStorageAt: Handler<[string, string, string?], string> = async (
  context,
  [address, position, blockTag],
) => {
  const block = await resolveBlock(context, blockTag)
  // Encode (H160, H256) tuple — address + storage slot, no length prefix
  const params = (encodeH160(address) + encodeH256(position).replace(/^0x/, '')) as HexString
  const result = await block.call('EthereumRuntimeRPCApi_storage_at', [params])
  // Result is H256 (32 bytes) — return as-is
  return result.result
}

/**
 * Executes a new message call immediately without creating a transaction on the block chain.
 */
export const eth_call: Handler<[Record<string, any>, string?], string> = async (context, [txObject, blockTag]) => {
  const block = await resolveBlock(context, blockTag)

  if (!txObject.to) {
    throw new ResponseError(-32602, 'Missing required field: to')
  }

  const params = encodeCallParams({
    from: txObject.from,
    to: txObject.to,
    data: txObject.data || txObject.input,
    value: txObject.value ? BigInt(txObject.value) : undefined,
    gasLimit: txObject.gas ? BigInt(txObject.gas) : undefined,
    maxFeePerGas: txObject.maxFeePerGas ? BigInt(txObject.maxFeePerGas) : undefined,
    accessList: txObject.accessList,
    estimate: false,
  })

  const result = await block.call('EthereumRuntimeRPCApi_call', [params])
  const decoded = decodeCallResult(result.result as HexString)

  if (!decoded.success) {
    throw new ResponseError(3, `execution reverted: ${decoded.returnData}`)
  }

  return decoded.returnData
}

/**
 * Generates and returns an estimate of how much gas is necessary to allow the transaction to complete.
 */
export const eth_estimateGas: Handler<[Record<string, any>, string?], string> = async (
  context,
  [txObject, blockTag],
) => {
  const block = await resolveBlock(context, blockTag)

  if (!txObject.to) {
    throw new ResponseError(-32602, 'Missing required field: to')
  }

  const params = encodeCallParams({
    from: txObject.from,
    to: txObject.to,
    data: txObject.data || txObject.input,
    value: txObject.value ? BigInt(txObject.value) : undefined,
    gasLimit: txObject.gas ? BigInt(txObject.gas) : undefined,
    estimate: true,
  })

  const result = await block.call('EthereumRuntimeRPCApi_call', [params])
  const decoded = decodeCallResult(result.result as HexString)
  return toEthQuantity(decoded.gasUsed)
}

/**
 * Returns a synthetic Ethereum block object for a given block number or tag.
 * Since chopsticks doesn't store full Ethereum blocks, we construct a minimal
 * block object from Substrate block data to satisfy wallet queries.
 */
export const eth_getBlockByNumber: Handler<[string, boolean?], Record<string, any> | null> = async (
  context,
  [blockTag, _fullTransactions],
) => {
  const block = await resolveBlock(context, blockTag)
  if (!block) return null

  const blockNumber = toEthQuantity(BigInt(block.number))
  const blockHash = block.hash

  return {
    number: blockNumber,
    hash: blockHash,
    parentHash: (await block.parentBlock)?.hash ?? '0x' + '00'.repeat(32),
    nonce: '0x0000000000000000',
    sha3Uncles: '0x1dcc4de8dec75d7aab85b567b6ccd41ad312451b948a7413f0a142fd40d49347',
    logsBloom: '0x' + '00'.repeat(256),
    transactionsRoot: '0x56e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421',
    stateRoot: '0x' + '00'.repeat(32),
    receiptsRoot: '0x56e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421',
    miner: '0x' + '00'.repeat(20),
    difficulty: '0x0',
    totalDifficulty: '0x0',
    extraData: '0x',
    size: '0x0',
    gasLimit: '0x1312d00',
    gasUsed: '0x0',
    timestamp: '0x0',
    transactions: [],
    uncles: [],
    baseFeePerGas: '0x0',
  }
}

/**
 * Returns a synthetic Ethereum block object for a given block hash.
 */
export const eth_getBlockByHash: Handler<[string, boolean?], Record<string, any> | null> = async (
  context,
  [blockHash, _fullTransactions],
) => {
  const block = await context.chain.getBlock(blockHash as HexString)
  if (!block) return null

  const blockNumber = toEthQuantity(BigInt(block.number))

  return {
    number: blockNumber,
    hash: block.hash,
    parentHash: (await block.parentBlock)?.hash ?? '0x' + '00'.repeat(32),
    nonce: '0x0000000000000000',
    sha3Uncles: '0x1dcc4de8dec75d7aab85b567b6ccd41ad312451b948a7413f0a142fd40d49347',
    logsBloom: '0x' + '00'.repeat(256),
    transactionsRoot: '0x56e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421',
    stateRoot: '0x' + '00'.repeat(32),
    receiptsRoot: '0x56e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421',
    miner: '0x' + '00'.repeat(20),
    difficulty: '0x0',
    totalDifficulty: '0x0',
    extraData: '0x',
    size: '0x0',
    gasLimit: '0x1312d00',
    gasUsed: '0x0',
    timestamp: '0x0',
    transactions: [],
    uncles: [],
    baseFeePerGas: '0x0',
  }
}

/**
 * Returns the current gas price in wei.
 */
export const eth_gasPrice: Handler<[], string> = async (context) => {
  const block = context.chain.head
  const result = await block.call('EthereumRuntimeRPCApi_gas_price', ['0x'])
  // Result is U256 LE (32 bytes)
  const price = decodeU256LE(result.result as string)
  return toEthQuantity(price)
}

/**
 * Returns the current network ID.
 */
export const net_version: Handler<[], string> = async (context) => {
  const block = context.chain.head
  const result = await block.call('EthereumRuntimeRPCApi_chain_id', ['0x'])
  const chainId = decodeU64LE(result.result as HexString)
  return chainId.toString()
}

/**
 * Returns the current client version.
 */
export const web3_clientVersion: Handler<[], string> = async () => {
  return 'chopsticks/v1'
}

/**
 * Returns an empty array for accounts (no wallet management).
 */
export const eth_accounts: Handler<[], string[]> = async () => {
  return []
}

/**
 * Returns true if the client is syncing.
 */
export const eth_syncing: Handler<[], false> = async () => {
  return false
}

/**
 * Returns "1" for mainnet (stub).
 */
export const net_listening: Handler<[], boolean> = async () => {
  return true
}

/**
 * Returns the number of peers (always 0 for chopsticks).
 */
export const net_peerCount: Handler<[], string> = async () => {
  return '0x0'
}
