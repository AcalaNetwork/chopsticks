import {
  bridgeLogger,
  encodeHash32,
  encodeParaInfo,
  encodeParaStoredHeaderData,
  importedParaHashesStorageKey,
  importedParaHeadsStorageKey,
  inboundLanesStorageKey,
  outboundLanesStorageKey,
  outboundMessagesStorageKey,
  parasInfoStorageKey,
} from '@acala-network/chopsticks-core'
import type { ApiPromise } from '@polkadot/api'
import type { ApiDecoration } from '@polkadot/api/types'
import type { AddressOrPair, SubmittableExtrinsic } from '@polkadot/api-base/types'
import type { Header } from '@polkadot/types/interfaces'
import type { IKeyringPair } from '@polkadot/types/types'
import { hexToU8a, stringCamelCase, stringPascalCase } from '@polkadot/util'
import type { HexString } from '@polkadot/util/types'

export interface ConnectBridgeHubsConfig {
  /** Signs `receive_messages_proof` (on destination) and `receive_messages_delivery_proof`
   * (on source). Must hold a balance on **both** chains. */
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
  /** Source-side `pallet_bridge_parachains` tracking the destination. Auto-detected. */
  sourceParachainsPallet?: string
  /** Destination para id, used by the delivery-confirmation proofs. Auto-detected. */
  destParaId?: number
}

export interface BridgeHandle {
  disconnect: () => Promise<void>
}

const DEFAULT_DISPATCH_WEIGHT = { refTime: 5_000_000_000n, proofSize: 65_536n }

// Max nonces per `receive_messages_proof`; cumulus hubs reject larger proofs as `TooManyMessagesInTheProof`.
const MAX_MESSAGES_PER_PROOF = 4096n

// Serialize pool submissions per chain so concurrent submits don't read the same nonce and drop one.
const chainLocks = new WeakMap<ApiPromise, Promise<unknown>>()
const runOnChain = <T>(api: ApiPromise, fn: () => Promise<T>): Promise<T> => {
  const run = (chainLocks.get(api) ?? Promise.resolve()).catch(() => {}).then(fn)
  chainLocks.set(api, run)
  return run
}

// Submit to `api`'s pool (no-callback form resolves on pool acceptance), serialized via `runOnChain`.
const submitTx = (api: ApiPromise, tx: SubmittableExtrinsic<'promise'>, signer: AddressOrPair): Promise<void> =>
  runOnChain(api, () => tx.signAndSend(signer, { era: 0 }).then(() => undefined))

// `is_obsolete` rejects an already-applied or gapped proof as `InvalidTransaction::Stale` — benign
// for the relayer (the lane already advanced), so it's matched rather than treated as a failure.
const isStaleError = (message: string): boolean => /stale/i.test(message)

// Single-slot serializer: each task runs after the previous; throws are logged under `label`.
const serialChain = (label: string) => {
  let tail: Promise<void> = Promise.resolve()
  return {
    enqueue: (fn: () => Promise<void>) => {
      tail = tail.then(fn).catch((err) => bridgeLogger.error({ err: (err as Error).message }, label))
    },
    drain: () => tail,
  }
}

// Lane id is the first (and only) key arg of an `entries()` key; polkadot.js doesn't type it, hence the cast.
const laneHexFromKey = (key: { args: unknown[] }): HexString => (key.args[0] as { toHex(): HexString }).toHex()

// The three `pallet_bridge_parachains` writes that import a bridged head, so a proof taken at that
// head verifies against it. Used both ways: deliver imports the source head on the destination,
// confirm imports the destination head on the source.
const importParaHead = (
  pallet: string,
  paraId: number,
  blockNumber: number,
  headBytes: Uint8Array,
  stateRoot: Uint8Array,
): [HexString, HexString][] => [
  [parasInfoStorageKey(pallet, paraId), encodeParaInfo(blockNumber, headBytes, 1)],
  [importedParaHeadsStorageKey(pallet, paraId, headBytes), encodeParaStoredHeaderData(blockNumber, stateRoot)],
  [importedParaHashesStorageKey(pallet, paraId, 0), encodeHash32(headBytes)],
]

/** Raw `InboundLaneData` JSON for one lane. */
type InboundLaneJson = {
  relayers?: { messages?: { begin?: number | string; end?: number | string } }[]
  lastConfirmedNonce?: number | string
} | null

/** `last_delivered_nonce` derived as the pallet does: last relayer entry's `messages.end`, or
 * `last_confirmed_nonce` when the relayer queue is empty. */
export const lastDeliveredFromInbound = (v: InboundLaneJson): bigint => {
  const relayers = v?.relayers ?? []
  return relayers.length ? BigInt(relayers[relayers.length - 1].messages?.end ?? 0) : BigInt(v?.lastConfirmedNonce ?? 0)
}

/** One relayer entry's `DeliveredMessages` range. */
type RelayerEntry = { messages?: { begin?: number | string; end?: number | string } }

/** `UnrewardedRelayersState` derived from an inbound lane's relayer queue exactly as the pallet's
 * `impl From<&InboundLaneData>` does (the dispatch rejects any mismatch with
 * `InvalidUnrewardedRelayersState`):
 * - `unrewardedRelayerEntries` = number of relayer entries in the queue;
 * - `totalMessages` spans the whole queue, `back.end - front.begin + 1` (NOT a per-entry sum);
 * - `messagesInOldestEntry` is only the *front* entry's own size, `front.end - front.begin + 1`;
 * - `lastDeliveredNonce` = `back.end`, or the passed `lastDelivered` (the lane's
 *   `last_confirmed_nonce`) when the queue is empty.
 */
export const deriveUnrewardedRelayersState = (
  relayers: RelayerEntry[],
  lastDelivered: bigint,
): {
  unrewardedRelayerEntries: number
  messagesInOldestEntry: bigint
  totalMessages: bigint
  lastDeliveredNonce: bigint
} => {
  if (relayers.length === 0) {
    return {
      unrewardedRelayerEntries: 0,
      messagesInOldestEntry: 0n,
      totalMessages: 0n,
      lastDeliveredNonce: lastDelivered,
    }
  }
  const frontBegin = BigInt(relayers[0].messages?.begin ?? 0)
  const frontEnd = BigInt(relayers[0].messages?.end ?? 0)
  return {
    unrewardedRelayerEntries: relayers.length,
    messagesInOldestEntry: frontEnd - frontBegin + 1n,
    totalMessages: lastDelivered - frontBegin + 1n,
    lastDeliveredNonce: lastDelivered,
  }
}

/**
 * Relay bridge messages between two forked bridge hubs via two reactive loops, each driven by a
 * chain's new heads; terminate with `handle.disconnect()`. The connector never builds blocks — it
 * reads state and pushes extrinsics to pools, then reacts to the heads produced by whatever builds
 * blocks (auto-build under `Instant`/`Batch`, or a host driving `dev_newBlock` under `Manual`), so
 * it works identically across build modes.
 *
 * - **deliver**: push `receive_messages_proof` for `[last_delivered+1 .. latest_generated]` (chunked
 *   to MAX_MESSAGES_PER_PROOF) to the destination pool. Starting at the live `last_delivered+1` gives
 *   `is_obsolete` its contiguity and re-delivers nothing.
 * - **confirm**: push `receive_messages_delivery_proof` to the source pool so `latest_received_nonce`
 *   advances and the destination prunes its relayers queue (else long runs hit the unconfirmed limit).
 *
 * `signer` must hold a balance on both sides.
 */
export const connectBridgeHubs = async (
  source: ApiPromise,
  destination: ApiPromise,
  config: ConnectBridgeHubsConfig,
): Promise<BridgeHandle> => {
  const sourceMessagesPallet = config.sourceMessagesPallet ?? detectBridgeMessagesPallet(source, 'query', 'source')
  const destParachainsPallet = config.destParachainsPallet ?? detectBridgeParachainsPallet(destination, 'destination')
  const destMessagesPallet = config.destMessagesPallet ?? detectBridgeMessagesPallet(destination, 'tx', 'destination')
  const sourceParaId = config.sourceParaId ?? (await detectParaId(source, 'source'))
  const dispatchWeight = config.dispatchWeightPerMessage ?? DEFAULT_DISPATCH_WEIGHT
  const signerAddress = typeof config.signer === 'string' ? config.signer : (config.signer as IKeyringPair).address
  const relayerIdAtSource = config.relayerIdAtSource ?? signerAddress

  // Confirm proves the destination's inbound lane on the source, so it needs the source-side
  // bridge-parachains pallet and the destination's para id (deliver's deps, reversed).
  const sourceParachainsPallet = config.sourceParachainsPallet ?? detectBridgeParachainsPallet(source, 'source')
  const destParaId = config.destParaId ?? (await detectParaId(destination, 'destination'))

  // camelCase pallet names for `api.query`/`api.tx` lookups.
  const sourceMessages = stringCamelCase(sourceMessagesPallet)
  const destMessages = stringCamelCase(destMessagesPallet)

  // lane -> source `latest_generated_nonce` observed on source heads (deliver up to this).
  const generated = new Map<HexString, bigint>()
  // lane -> `noncesEnd` of a delivery pushed to the destination pool but not yet observed applied.
  const inFlight = new Map<HexString, bigint>()
  // lane -> highest destination `last_delivered_nonce` already confirmed back to source.
  const confirmed = new Map<HexString, bigint>()
  // Latest observed source head; outbound messages are proven against it (they exist there, since
  // `latest_generated >= to`). Set on connect and refreshed on every source head.
  let latestSourceHash: HexString | undefined
  let latestSourceNumber = 0

  // Push one chunk `[from..=to]` to the destination pool, proven against the latest source head
  // (the messages exist there since `latest_generated >= to`). Outbound lane state proven alongside.
  const deliverRange = async (laneHex: HexString, from: bigint, to: bigint): Promise<void> => {
    const laneBytes = hexToU8a(laneHex)
    const headHashBytes = hexToU8a(latestSourceHash as HexString)

    const keys: HexString[] = [outboundLanesStorageKey(sourceMessagesPallet, laneBytes)]
    for (let n = from; n <= to; n++) {
      keys.push(outboundMessagesStorageKey(sourceMessagesPallet, laneBytes, n))
    }
    // `dev_getReadProof` (not spec `state_getReadProof`) returns the recomputed `stateRoot` that the
    // verifier checks against — it diverges from `header.state_root` once local overrides are applied.
    const proof = await rawRpc<{ at: HexString; proof: HexString[]; stateRoot: HexString }>(
      source,
      'dev_getReadProof',
      [keys, latestSourceHash],
    )

    const setStoragePayload = importParaHead(
      destParachainsPallet,
      sourceParaId,
      latestSourceNumber,
      headHashBytes,
      hexToU8a(proof.stateRoot),
    )
    await rawRpc(destination, 'dev_setStorage', [setStoragePayload])

    const count = Number(to - from + 1n)
    const tx: SubmittableExtrinsic<'promise'> = destination.tx[destMessages].receiveMessagesProof(
      relayerIdAtSource,
      {
        bridgedHeaderHash: latestSourceHash,
        storageProof: proof.proof,
        lane: laneHex,
        noncesStart: from,
        noncesEnd: to,
      },
      count,
      { refTime: dispatchWeight.refTime * BigInt(count), proofSize: dispatchWeight.proofSize * BigInt(count) },
    )
    await submitTx(destination, tx, config.signer)
    bridgeLogger.info(
      { lane: laneHex, range: `${from}..=${to}`, sourceBlock: latestSourceNumber },
      'pushed bridge delivery',
    )
  }

  // Push the next chunk for a lane if ready. Reads the live `last_delivered_nonce` so the proof
  // starts at `last_delivered+1` (is_obsolete contiguity); an in-flight chunk blocks further pushes
  // until a destination head shows it applied.
  const tryDeliverLane = async (laneHex: HexString): Promise<void> => {
    if (latestSourceHash === undefined) return
    const generatedNonce = generated.get(laneHex) ?? 0n
    const delivered = lastDeliveredFromInbound(
      (await destination.query[destMessages].inboundLanes(laneHex)).toJSON() as InboundLaneJson,
    )
    const pending = inFlight.get(laneHex)
    if (pending !== undefined) {
      if (delivered >= pending) inFlight.delete(laneHex)
      else return // previous chunk not applied yet — a further push would gap
    }
    if (generatedNonce <= delivered) return // nothing new to deliver
    const from = delivered + 1n
    const lastInChunk = from + MAX_MESSAGES_PER_PROOF - 1n
    const to = lastInChunk < generatedNonce ? lastInChunk : generatedNonce
    await deliverRange(laneHex, from, to)
    inFlight.set(laneHex, to)
  }

  // On any head, push whatever is currently deliverable on each known lane.
  const syncDeliveries = async (): Promise<void> => {
    for (const laneHex of generated.keys()) {
      try {
        await tryDeliverLane(laneHex)
      } catch (err) {
        const message = (err as Error).message
        inFlight.delete(laneHex) // allow a re-push on the next head
        // a `stale` push means our `last_delivered` view lagged the chain — benign, just retry
        if (isStaleError(message)) {
          bridgeLogger.debug({ lane: laneHex }, 'delivery push stale; will retry')
        } else {
          bridgeLogger.warn({ err: message, lane: laneHex }, 'delivery push failed; will retry')
        }
      }
    }
  }

  // Relay one lane's confirmation to `source`: prove the destination's `InboundLanes[lane]` (at
  // `destHashHex`, where the delivery is applied) and submit `receive_messages_delivery_proof`,
  // advancing the source's `latest_received_nonce`. Mirror of deliver.
  const confirm = async (destHashHex: HexString, destBlockNumber: number, lane: InboundLane): Promise<void> => {
    const { laneHex, relayers, lastDelivered } = lane
    const laneBytes = hexToU8a(laneHex)
    const destHeadBytes = hexToU8a(destHashHex)

    // Idempotency guard: skip if the source already covers `lastDelivered` (else `is_obsolete`
    // rejects the re-submit as stale).
    const sourceReceived = BigInt(
      (
        (await source.query[sourceMessages].outboundLanes(laneHex)).toJSON() as {
          latestReceivedNonce?: number | string
        } | null
      )?.latestReceivedNonce ?? 0,
    )
    if (lastDelivered <= sourceReceived) return

    const relayersState = deriveUnrewardedRelayersState(relayers, lastDelivered)

    const proof = await rawRpc<{ at: HexString; proof: HexString[]; stateRoot: HexString }>(
      destination,
      'dev_getReadProof',
      [[inboundLanesStorageKey(destMessagesPallet, laneBytes)], destHashHex],
    )

    const setStoragePayload = importParaHead(
      sourceParachainsPallet,
      destParaId,
      destBlockNumber,
      destHeadBytes,
      hexToU8a(proof.stateRoot),
    )
    await rawRpc(source, 'dev_setStorage', [setStoragePayload])

    const tx: SubmittableExtrinsic<'promise'> = source.tx[sourceMessages].receiveMessagesDeliveryProof(
      { bridgedHeaderHash: destHashHex, storageProof: proof.proof, lane: laneHex },
      relayersState,
    )
    await submitTx(source, tx, config.signer)

    bridgeLogger.info(
      { lane: laneHex, lastDelivered: lastDelivered.toString(), destBlock: destBlockNumber },
      'confirmed bridge deliveries',
    )
  }

  // Per-lane `latest_generated_nonce` from `OutboundLanes` at a pinned source block.
  const readOutboundLanes = async (apiAt: ApiDecoration<'promise'>): Promise<[HexString, bigint][]> => {
    const entries = await apiAt.query[sourceMessages].outboundLanes.entries()
    return entries.map(([key, valueCodec]) => {
      const v = valueCodec.toJSON() as { latestGeneratedNonce?: number | string } | null
      return [laneHexFromKey(key), BigInt(v?.latestGeneratedNonce ?? 0)] as [HexString, bigint]
    })
  }

  // Per-lane `InboundLaneData` from `InboundLanes` at a pinned destination block, with
  // `last_delivered_nonce` derived as the pallet does (see `lastDeliveredFromInbound`).
  const readInboundLanes = async (apiAt: ApiDecoration<'promise'>): Promise<InboundLane[]> => {
    const entries = await apiAt.query[destMessages].inboundLanes.entries()
    return entries.map(([key, valueCodec]) => {
      const v = valueCodec.toJSON() as InboundLaneJson
      return { laneHex: laneHexFromKey(key), relayers: v?.relayers ?? [], lastDelivered: lastDeliveredFromInbound(v) }
    })
  }

  // On a source head: pin it as the proving head and update each lane's generated high-water mark.
  // Read at the header's own hash so a later proof attests exactly the nonces extant at that head.
  const refreshGenerated = async (sourceHeader: Header): Promise<void> => {
    const sourceHashHex = sourceHeader.hash.toHex() as HexString
    try {
      const lanes = await readOutboundLanes(await source.at(sourceHashHex))
      latestSourceHash = sourceHashHex
      latestSourceNumber = sourceHeader.number.toNumber()
      for (const [laneHex, latestGenerated] of lanes) generated.set(laneHex, latestGenerated)
    } catch (err) {
      bridgeLogger.warn({ err: (err as Error).message, sourceHash: sourceHashHex }, 'outboundLanes enumeration failed')
    }
  }

  const pumpConfirm = async (destHeader: Header) => {
    const destHashHex = destHeader.hash.toHex() as HexString
    const destBlockNumber = destHeader.number.toNumber()

    let lanes: InboundLane[]
    try {
      lanes = await readInboundLanes(await destination.at(destHashHex))
    } catch (err) {
      bridgeLogger.warn({ err: (err as Error).message, destHash: destHashHex }, 'inboundLanes enumeration failed')
      return
    }

    for (const lane of lanes) {
      if (lane.lastDelivered <= (confirmed.get(lane.laneHex) ?? 0n)) continue
      try {
        await confirm(destHashHex, destBlockNumber, lane)
        confirmed.set(lane.laneHex, lane.lastDelivered)
      } catch (err) {
        const message = (err as Error).message
        // A `stale` rejection is benign: the source lane already advanced (a competing
        // confirmation, or our own already-applied submit racing the read), so mark it done.
        if (isStaleError(message)) {
          confirmed.set(lane.laneHex, lane.lastDelivered)
          bridgeLogger.debug({ lane: lane.laneHex }, 'confirmation already applied (stale); skipping')
        } else {
          // Leave `confirmed` un-advanced so the next destination head retries.
          bridgeLogger.warn({ err: message, lane: lane.laneHex }, 'confirmation failed; will retry')
        }
      }
    }
  }

  // Delivery self-seeds (live `last_delivered` + `refreshGenerated` on the first source head), so
  // only confirm needs a baseline: pin `confirmed` to the current `last_delivered` so a fork's
  // pre-existing delivered-but-unconfirmed backlog isn't re-confirmed.
  try {
    const destHead = await destination.rpc.chain.getBlockHash()
    for (const lane of await readInboundLanes(await destination.at(destHead))) {
      confirmed.set(lane.laneHex, lane.lastDelivered)
    }
  } catch (err) {
    bridgeLogger.warn(
      { err: (err as Error).message },
      'confirmation baseline seed failed; lanes baseline on first head',
    )
  }

  // Delivery is serialized across both head streams (source heads update generated, destination
  // heads observe applied chunks); confirmation is its own queue on destination heads.
  const deliverQueue = serialChain('unexpected deliver error')
  const confirmQueue = serialChain('unexpected confirm-pump error')
  const unsubSource = await source.rpc.chain.subscribeNewHeads((header) => {
    deliverQueue.enqueue(async () => {
      await refreshGenerated(header)
      await syncDeliveries()
    })
  })
  const unsubDest = await destination.rpc.chain.subscribeNewHeads((header) => {
    // A destination block may have applied an in-flight chunk → push the next one.
    deliverQueue.enqueue(() => syncDeliveries())
    confirmQueue.enqueue(() => pumpConfirm(header))
  })

  bridgeLogger.info(
    {
      sourceMessagesPallet,
      destParachainsPallet,
      destMessagesPallet,
      sourceParaId,
      sourceParachainsPallet,
      destParaId,
    },
    'bridge connector started',
  )

  return {
    async disconnect() {
      unsubSource()
      unsubDest()
      await Promise.all([deliverQueue.drain(), confirmQueue.drain()])
      bridgeLogger.info('bridge connector stopped')
    },
  }
}

/** Parsed `InboundLaneData` for one lane: the relayer queue and derived `last_delivered_nonce`. */
interface InboundLane {
  laneHex: HexString
  relayers: { messages?: { begin?: number | string; end?: number | string } }[]
  lastDelivered: bigint
}

const rawRpc = async <T>(api: ApiPromise, method: string, params: unknown[]): Promise<T> => {
  const provider = (api as any)._rpcCore?.provider
  if (!provider?.send) throw new Error(`connectBridgeHubs: cannot access provider for ${method}`)
  return provider.send(method, params)
}

/**
 * Find the unique pallet in `namespace` matching `predicate`, returning its PascalCase
 * name. Throws a remediation-pointing error on zero or multiple matches.
 */
const detectPallet = (
  namespace: Record<string, any>,
  predicate: (pallet: any) => boolean,
  describe: { none: string; many: (names: string) => string },
): string => {
  const matches = Object.keys(namespace).filter((key) => predicate(namespace[key]))
  if (matches.length === 0) throw new Error(describe.none)
  if (matches.length > 1) throw new Error(describe.many(matches.map(stringPascalCase).join(', ')))
  return stringPascalCase(matches[0])
}

const detectBridgeMessagesPallet = (api: ApiPromise, side: 'query' | 'tx', label: 'source' | 'destination'): string => {
  const field = side === 'query' ? 'sourceMessagesPallet' : 'destMessagesPallet'
  return detectPallet(
    side === 'query' ? api.query : api.tx,
    (p) => (side === 'query' ? p?.outboundLanes && p?.outboundMessages : p?.receiveMessagesProof),
    {
      none: `connectBridgeHubs: no pallet_bridge_messages instance on ${label}`,
      many: (names) => `connectBridgeHubs: ${label} has multiple bridge-messages instances (${names}); set ${field}`,
    },
  )
}

const detectBridgeParachainsPallet = (api: ApiPromise, label: 'source' | 'destination'): string => {
  const field = label === 'source' ? 'sourceParachainsPallet' : 'destParachainsPallet'
  return detectPallet(api.query, (p) => p?.parasInfo && p?.importedParaHeads, {
    none: `connectBridgeHubs: no pallet_bridge_parachains instance on ${label}`,
    many: (names) => `connectBridgeHubs: ${label} has multiple bridge-parachains instances (${names}); set ${field}`,
  })
}

const detectParaId = async (api: ApiPromise, label: 'source' | 'destination'): Promise<number> => {
  const idCodec = await (api.query.parachainInfo as any)?.parachainId?.()
  if (idCodec) return (idCodec as any).toNumber()
  throw new Error(`connectBridgeHubs: cannot auto-detect ${label === 'source' ? 'sourceParaId' : 'destParaId'}`)
}
