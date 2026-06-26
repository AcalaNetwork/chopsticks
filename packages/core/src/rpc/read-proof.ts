import type { HexString } from '@polkadot/util/types'

import { defaultLogger } from '../logger.js'
import { isPrefixedChildKey } from '../utils/index.js'
import { createProof } from '../wasm-executor/index.js'
import { type Context, ResponseError } from './shared.js'

const logger = defaultLogger.child({ name: 'rpc-read-proof' })

/**
 * Compose a storage read proof: chopsticks keeps no trie of its own, so it fetches a base
 * proof from upstream (falling back to upstream head for chopsticks-only blocks) and
 * re-applies chopsticks-side values via `createProof`. Returns the proof nodes and the
 * recomputed trie root — which diverges from `chain_getHeader(at).state_root` once local
 * overrides are applied. Shared by `state_getReadProof` (drops the root, spec shape) and
 * `dev_getReadProof` (keeps it). Child-storage keys are rejected.
 */
export const buildReadProof = async (
  context: Context,
  keys: HexString[],
  hash: HexString | undefined,
): Promise<{ at: HexString; proof: HexString[]; stateRoot: HexString }> => {
  if (keys.length === 0) {
    throw new ResponseError(-32602, 'getReadProof requires a non-empty array of keys')
  }
  for (const key of keys) {
    if (isPrefixedChildKey(key)) {
      throw new ResponseError(
        -32601,
        `getReadProof does not support child-storage keys (got ${key}); use state_getChildReadProof`,
      )
    }
  }

  const block = await context.chain.getBlock(hash)
  if (!block) {
    throw new ResponseError(1, `Block ${hash ?? 'head'} not found`)
  }

  // Upstream rejects chopsticks-only blocks with UnknownBlock; fall back to upstream
  // head whose trie is guaranteed available.
  const fetchUpstreamProof = async (): Promise<{ at: HexString; proof: HexString[] }> => {
    try {
      return await context.chain.api.getReadProof(keys, block.hash as HexString)
    } catch (err) {
      logger.debug(
        { err: (err as Error).message, blockHash: block.hash },
        'getReadProof at block failed; retrying at head',
      )
      try {
        return await context.chain.api.getReadProof(keys)
      } catch (err2) {
        throw new ResponseError(
          -32603,
          `getReadProof: upstream rejected at block ${block.hash} and at head (${(err2 as Error).message})`,
        )
      }
    }
  }

  // The local reads and the upstream proof are independent — overlap their round trips.
  const [updates, upstreamProof] = await Promise.all([
    Promise.all(keys.map(async (key) => [key, (await block.get(key)) ?? null] as [HexString, HexString | null])),
    fetchUpstreamProof(),
  ])

  const { trieRootHash, nodes } = await createProof(upstreamProof.proof, updates)
  return { at: block.hash as HexString, proof: nodes, stateRoot: trieRootHash }
}
