import {
  bridgeLogger,
  encodeHash32,
  encodeParaInfo,
  encodeParaStoredHeaderData,
  importedParaHashesStorageKey,
  importedParaHeadsStorageKey,
  outboundMessagesStorageKey,
  parasInfoStorageKey,
} from '@acala-network/chopsticks-core'
import type { ApiPromise } from '@polkadot/api'
import type { AddressOrPair, SubmittableExtrinsic } from '@polkadot/api-base/types'
import type { Header } from '@polkadot/types/interfaces'
import { hexToU8a } from '@polkadot/util'
import type { HexString } from '@polkadot/util/types'
import { blake2AsU8a } from '@polkadot/util-crypto'

export interface ConnectBridgeHubsConfig {
  /** Submits `receive_messages_proof` on destination. Must hold a balance there. */
  signer: AddressOrPair
  /** Pallet name overrides. Auto-detected by storage shape when omitted. */
  sourceMessagesPallet?: string
  destParachainsPallet?: string
  destMessagesPallet?: string
  /** Auto-detected via `parachainInfo.parachainId` when omitted. */
  sourceParaId?: number
  /** Credited as `relayer_id_at_bridged_chain`. Defaults to signer's address. */
  relayerIdAtSource?: string
  /** Per-message weight upper bound. Default fits a typical XCM Transact. */
  dispatchWeightPerMessage?: { refTime: bigint; proofSize: bigint }
  /** Build a destination block immediately after each delivery. Default true. */
  buildDestBlock?: boolean
}

export interface BridgeHandle {
  disconnect: () => Promise<void>
}

interface LaneState {
  latestGeneratedNonce: bigint
  latestReceivedNonce: bigint
}

const DEFAULT_DISPATCH_WEIGHT = { refTime: 5_000_000_000n, proofSize: 65_536n }

/**
 * Continuously deliver outbound bridge messages from `source` to `destination`.
 *
 * Subscribes to source's new heads; on every block, diffs `<sourceMessagesPallet>.outboundLanes`
 * against an in-memory baseline and forwards new (lane, nonce-range) ranges via
 * `receive_messages_proof` on destination. Mirrors the `connectUpward` / `connectHorizontal`
 * shape: subscribe once, react forever, terminate via `handle.disconnect()`.
 *
 * First-sight of a lane records its current `latest_generated_nonce` as the baseline so
 * forks at non-zero state don't replay history.
 */
export const connectBridgeHubs = async (
  source: ApiPromise,
  destination: ApiPromise,
  config: ConnectBridgeHubsConfig,
): Promise<BridgeHandle> => {
  const sourceMessagesPallet = config.sourceMessagesPallet ?? detectBridgeMessagesPallet(source, 'query', 'source')
  const destParachainsPallet = config.destParachainsPallet ?? detectBridgeParachainsPallet(destination)
  const destMessagesPallet = config.destMessagesPallet ?? detectBridgeMessagesPallet(destination, 'tx', 'destination')
  const sourceParaId = config.sourceParaId ?? (await detectSourceParaId(source))
  const buildDestBlock = config.buildDestBlock ?? true
  const dispatchWeight = config.dispatchWeightPerMessage ?? DEFAULT_DISPATCH_WEIGHT
  const relayerIdAtSource =
    config.relayerIdAtSource ?? (typeof config.signer === 'string' ? config.signer : (config.signer as any).address)

  const seen = new Map<HexString, LaneState>()
  let pumpInFlight: Promise<void> = Promise.resolve()

  const pump = async (sourceHeader: Header) => {
    const sourceHashHex = sourceHeader.hash.toHex() as HexString
    const sourceBlockNumber = sourceHeader.number.toNumber()

    let lanes: [HexString, LaneState][]
    try {
      // Read at `sourceHeader.hash` not the live head: newer blocks may have arrived
      // while this pump is queued, and a proof built against `sourceHeader` against
      // newer-head state would attest non-existence for not-yet-extant nonces.
      const apiAt = await source.at(sourceHashHex)
      const entries = await apiAt.query[camel(sourceMessagesPallet)].outboundLanes.entries()
      lanes = entries.map(([key, valueCodec]) => {
        const laneHex = (key.args[0] as any).toHex() as HexString
        const v = valueCodec.toJSON() as {
          latestGeneratedNonce?: number | string
          latestReceivedNonce?: number | string
        } | null
        return [
          laneHex,
          {
            latestGeneratedNonce: BigInt(v?.latestGeneratedNonce ?? 0),
            latestReceivedNonce: BigInt(v?.latestReceivedNonce ?? 0),
          },
        ]
      })
    } catch (err) {
      bridgeLogger.warn({ err: (err as Error).message, sourceHash: sourceHashHex }, 'outboundLanes enumeration failed')
      return
    }

    for (const [laneHex, current] of lanes) {
      const prev = seen.get(laneHex)
      if (!prev) {
        seen.set(laneHex, current)
        continue
      }
      if (current.latestGeneratedNonce <= prev.latestGeneratedNonce) continue

      const noncesStart = prev.latestGeneratedNonce + 1n
      const noncesEnd = current.latestGeneratedNonce
      try {
        await deliver({
          source,
          destination,
          sourceMessagesPallet,
          destParachainsPallet,
          destMessagesPallet,
          sourceParaId,
          signer: config.signer,
          relayerIdAtSource,
          dispatchWeight,
          buildDestBlock,
          sourceHashHex,
          sourceBlockNumber,
          laneHex,
          noncesStart,
          noncesEnd,
        })
        seen.set(laneHex, current)
      } catch (err) {
        // Leave `seen` un-advanced so the next source head retries this range.
        bridgeLogger.warn(
          { err: (err as Error).message, lane: laneHex, range: `${noncesStart}..=${noncesEnd}` },
          'delivery failed; will retry',
        )
      }
    }
  }

  const unsubscribe = await source.rpc.chain.subscribeNewHeads((header) => {
    pumpInFlight = pumpInFlight
      .then(() => pump(header))
      .catch((err) => {
        bridgeLogger.error({ err: (err as Error).message }, 'unexpected pump error')
      })
  })

  bridgeLogger.info(
    { sourceMessagesPallet, destParachainsPallet, destMessagesPallet, sourceParaId },
    'bridge connector started',
  )

  return {
    async disconnect() {
      unsubscribe()
      await pumpInFlight
      bridgeLogger.info('bridge connector stopped')
    },
  }
}

interface DeliverParams {
  source: ApiPromise
  destination: ApiPromise
  sourceMessagesPallet: string
  destParachainsPallet: string
  destMessagesPallet: string
  sourceParaId: number
  signer: AddressOrPair
  relayerIdAtSource: string
  dispatchWeight: { refTime: bigint; proofSize: bigint }
  buildDestBlock: boolean
  sourceHashHex: HexString
  sourceBlockNumber: number
  laneHex: HexString
  noncesStart: bigint
  noncesEnd: bigint
}

const deliver = async (p: DeliverParams): Promise<void> => {
  const laneBytes = hexToU8a(p.laneHex)
  const headHashBytes = hexToU8a(p.sourceHashHex)

  const keys: HexString[] = []
  for (let n = p.noncesStart; n <= p.noncesEnd; n++) {
    keys.push(outboundMessagesStorageKey(p.sourceMessagesPallet, laneBytes, n))
  }

  const proof = await p.source.rpc.state.getReadProof(keys, p.sourceHashHex)
  const proofNodes = proof.proof.map((b) => b.toHex() as HexString)

  // Use the proof's own root, not `source.header.state_root`: chopsticks's
  // `state_getReadProof` may fall back to upstream-head for chopsticks-only blocks,
  // so the proof verifies against a recomputed composite root that diverges from
  // `header.state_root` once local overrides are applied.
  const proofStateRoot = findTrieRoot(proofNodes.map((n) => hexToU8a(n)))

  const setStoragePayload: [HexString, HexString][] = [
    [
      parasInfoStorageKey(p.destParachainsPallet, p.sourceParaId),
      encodeParaInfo(p.sourceBlockNumber, headHashBytes, 1),
    ],
    [
      importedParaHeadsStorageKey(p.destParachainsPallet, p.sourceParaId, headHashBytes),
      encodeParaStoredHeaderData(p.sourceBlockNumber, proofStateRoot),
    ],
    [importedParaHashesStorageKey(p.destParachainsPallet, p.sourceParaId, 0), encodeHash32(headHashBytes)],
  ]
  await rawRpc(p.destination, 'dev_setStorage', [setStoragePayload])

  const messagesCount = Number(p.noncesEnd - p.noncesStart + 1n)
  const totalWeight = {
    refTime: p.dispatchWeight.refTime * BigInt(messagesCount),
    proofSize: p.dispatchWeight.proofSize * BigInt(messagesCount),
  }

  const tx: SubmittableExtrinsic<'promise'> = p.destination.tx[camel(p.destMessagesPallet)].receiveMessagesProof(
    p.relayerIdAtSource,
    {
      bridgedHeaderHash: p.sourceHashHex,
      storageProof: proofNodes,
      lane: p.laneHex,
      noncesStart: p.noncesStart,
      noncesEnd: p.noncesEnd,
    },
    messagesCount,
    totalWeight,
  )

  // No-callback form resolves on pool submission; the callback form waits for
  // `isInBlock` and deadlocks against the manual `dev_newBlock` below.
  await tx.signAndSend(p.signer as any, { era: 0 })

  bridgeLogger.info(
    {
      lane: p.laneHex,
      range: `${p.noncesStart}..=${p.noncesEnd}`,
      sourceBlock: p.sourceBlockNumber,
      proofNodes: proofNodes.length,
    },
    'delivered bridge messages',
  )

  if (p.buildDestBlock) {
    await rawRpc(p.destination, 'dev_newBlock', [])
  }
}

const rawRpc = async <T>(api: ApiPromise, method: string, params: unknown[]): Promise<T> => {
  const provider = (api as any)._rpcCore?.provider
  if (!provider?.send) throw new Error(`connectBridgeHubs: cannot access provider for ${method}`)
  return provider.send(method, params)
}

/**
 * Extract the trie root from a Merkle proof's node bytes.
 *
 * `state_getReadProof` returns `{ at, proof }` per spec; the proof's recomputed root is
 * needed when writing `ImportedParaHeads` so the verifier can re-check against it. The
 * root is the unique node whose blake2_256 hash is not referenced as a 32-byte
 * sub-sequence inside any other node.
 */
const findTrieRoot = (nodes: Uint8Array[]): Uint8Array => {
  if (nodes.length === 0) throw new Error('findTrieRoot: empty proof')
  const hashes = nodes.map((n) => blake2AsU8a(n, 256))
  if (nodes.length === 1) return hashes[0]

  const referenced = new Set<string>()
  for (let i = 0; i < nodes.length; i++) {
    for (let j = 0; j < nodes.length; j++) {
      if (i === j) continue
      const hHex = u8aHex(hashes[j])
      if (referenced.has(hHex)) continue
      if (containsBytes(nodes[i], hashes[j])) referenced.add(hHex)
    }
  }

  const unreferenced = hashes.filter((h) => !referenced.has(u8aHex(h)))
  if (unreferenced.length === 0) throw new Error('findTrieRoot: cyclic proof')
  if (unreferenced.length > 1) throw new Error(`findTrieRoot: ${unreferenced.length} disjoint roots`)
  return unreferenced[0]
}

const containsBytes = (haystack: Uint8Array, needle: Uint8Array): boolean => {
  outer: for (let i = 0; i + needle.length <= haystack.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) continue outer
    }
    return true
  }
  return false
}

const u8aHex = (b: Uint8Array): string => {
  let s = ''
  for (const x of b) s += (x < 16 ? '0' : '') + x.toString(16)
  return s
}

const camel = (p: string): string => (p.length === 0 ? p : p[0].toLowerCase() + p.slice(1))

const detectBridgeMessagesPallet = (api: ApiPromise, side: 'query' | 'tx', label: 'source' | 'destination'): string => {
  const namespace = side === 'query' ? api.query : api.tx
  const matches: string[] = []
  for (const key of Object.keys(namespace)) {
    const pallet = (namespace as any)[key]
    const hit = side === 'query' ? pallet?.outboundLanes && pallet?.outboundMessages : pallet?.receiveMessagesProof
    if (hit) matches.push(key)
  }
  if (matches.length === 0) {
    throw new Error(`connectBridgeHubs: no pallet_bridge_messages instance on ${label}`)
  }
  if (matches.length > 1) {
    const names = matches.map((m) => m[0].toUpperCase() + m.slice(1)).join(', ')
    const field = side === 'query' ? 'sourceMessagesPallet' : 'destMessagesPallet'
    throw new Error(`connectBridgeHubs: ${label} has multiple bridge-messages instances (${names}); set ${field}`)
  }
  return matches[0][0].toUpperCase() + matches[0].slice(1)
}

const detectBridgeParachainsPallet = (api: ApiPromise): string => {
  const matches: string[] = []
  for (const key of Object.keys(api.query)) {
    const pallet = (api.query as any)[key]
    if (pallet?.parasInfo && pallet?.importedParaHeads) matches.push(key)
  }
  if (matches.length === 0) {
    throw new Error('connectBridgeHubs: no pallet_bridge_parachains instance on destination')
  }
  if (matches.length > 1) {
    const names = matches.map((m) => m[0].toUpperCase() + m.slice(1)).join(', ')
    throw new Error(
      `connectBridgeHubs: destination has multiple bridge-parachains instances (${names}); set destParachainsPallet`,
    )
  }
  return matches[0][0].toUpperCase() + matches[0].slice(1)
}

const detectSourceParaId = async (api: ApiPromise): Promise<number> => {
  const idCodec = await (api.query.parachainInfo as any)?.parachainId?.()
  if (idCodec) return (idCodec as any).toNumber()
  throw new Error('connectBridgeHubs: cannot auto-detect sourceParaId')
}
