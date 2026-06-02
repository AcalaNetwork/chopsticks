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
import type { IKeyringPair } from '@polkadot/types/types'
import { hexToU8a, stringCamelCase, stringPascalCase } from '@polkadot/util'
import type { HexString } from '@polkadot/util/types'

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
    config.relayerIdAtSource ??
    (typeof config.signer === 'string' ? config.signer : (config.signer as IKeyringPair).address)

  // lane -> highest generated nonce already delivered (or baselined).
  const seen = new Map<HexString, bigint>()
  let pumpInFlight: Promise<void> = Promise.resolve()

  // Deliver one lane's new nonce range to `destination`. Captures the per-connector
  // config; only the per-delivery coordinates vary.
  const deliver = async (
    sourceHashHex: HexString,
    sourceBlockNumber: number,
    laneHex: HexString,
    noncesStart: bigint,
    noncesEnd: bigint,
  ): Promise<void> => {
    const laneBytes = hexToU8a(laneHex)
    const headHashBytes = hexToU8a(sourceHashHex)

    const keys: HexString[] = []
    for (let n = noncesStart; n <= noncesEnd; n++) {
      keys.push(outboundMessagesStorageKey(sourceMessagesPallet, laneBytes, n))
    }

    // chopsticks's `dev_getReadProof` returns `stateRoot` alongside the proof — the
    // recomputed root, which diverges from `header.state_root` once local overrides are
    // applied. That's the value the verifier checks against. (The spec `state_getReadProof`
    // omits it, hence the raw call to the chopsticks-specific dev method.)
    const proof = await rawRpc<{ at: HexString; proof: HexString[]; stateRoot: HexString }>(
      source,
      'dev_getReadProof',
      [keys, sourceHashHex],
    )
    const proofNodes = proof.proof
    const proofStateRoot = hexToU8a(proof.stateRoot)

    const setStoragePayload: [HexString, HexString][] = [
      [parasInfoStorageKey(destParachainsPallet, sourceParaId), encodeParaInfo(sourceBlockNumber, headHashBytes, 1)],
      [
        importedParaHeadsStorageKey(destParachainsPallet, sourceParaId, headHashBytes),
        encodeParaStoredHeaderData(sourceBlockNumber, proofStateRoot),
      ],
      [importedParaHashesStorageKey(destParachainsPallet, sourceParaId, 0), encodeHash32(headHashBytes)],
    ]
    await rawRpc(destination, 'dev_setStorage', [setStoragePayload])

    const messagesCount = Number(noncesEnd - noncesStart + 1n)
    const totalWeight = {
      refTime: dispatchWeight.refTime * BigInt(messagesCount),
      proofSize: dispatchWeight.proofSize * BigInt(messagesCount),
    }

    const tx: SubmittableExtrinsic<'promise'> = destination.tx[
      stringCamelCase(destMessagesPallet)
    ].receiveMessagesProof(
      relayerIdAtSource,
      { bridgedHeaderHash: sourceHashHex, storageProof: proofNodes, lane: laneHex, noncesStart, noncesEnd },
      messagesCount,
      totalWeight,
    )

    // No-callback form resolves on pool submission; the callback form waits for
    // `isInBlock` and deadlocks against the manual `dev_newBlock` below.
    await tx.signAndSend(config.signer, { era: 0 })

    bridgeLogger.info(
      {
        lane: laneHex,
        range: `${noncesStart}..=${noncesEnd}`,
        sourceBlock: sourceBlockNumber,
        proofNodes: proofNodes.length,
      },
      'delivered bridge messages',
    )

    if (buildDestBlock) {
      await rawRpc(destination, 'dev_newBlock', [])
    }
  }

  const pump = async (sourceHeader: Header) => {
    const sourceHashHex = sourceHeader.hash.toHex() as HexString
    const sourceBlockNumber = sourceHeader.number.toNumber()

    let lanes: [HexString, bigint][]
    try {
      // Read at `sourceHeader.hash` not the live head: newer blocks may have arrived
      // while this pump is queued, and a proof built against `sourceHeader` against
      // newer-head state would attest non-existence for not-yet-extant nonces.
      const apiAt = await source.at(sourceHashHex)
      const entries = await apiAt.query[stringCamelCase(sourceMessagesPallet)].outboundLanes.entries()
      lanes = entries.map(([key, valueCodec]) => {
        const laneHex = (key.args[0] as any).toHex() as HexString
        const v = valueCodec.toJSON() as { latestGeneratedNonce?: number | string } | null
        return [laneHex, BigInt(v?.latestGeneratedNonce ?? 0)] as [HexString, bigint]
      })
    } catch (err) {
      bridgeLogger.warn({ err: (err as Error).message, sourceHash: sourceHashHex }, 'outboundLanes enumeration failed')
      return
    }

    for (const [laneHex, latestGenerated] of lanes) {
      const prev = seen.get(laneHex)
      if (prev === undefined) {
        seen.set(laneHex, latestGenerated)
        continue
      }
      if (latestGenerated <= prev) continue

      const noncesStart = prev + 1n
      try {
        await deliver(sourceHashHex, sourceBlockNumber, laneHex, noncesStart, latestGenerated)
        seen.set(laneHex, latestGenerated)
      } catch (err) {
        // Leave `seen` un-advanced so the next source head retries this range.
        bridgeLogger.warn(
          { err: (err as Error).message, lane: laneHex, range: `${noncesStart}..=${latestGenerated}` },
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

const detectBridgeParachainsPallet = (api: ApiPromise): string =>
  detectPallet(api.query, (p) => p?.parasInfo && p?.importedParaHeads, {
    none: 'connectBridgeHubs: no pallet_bridge_parachains instance on destination',
    many: (names) =>
      `connectBridgeHubs: destination has multiple bridge-parachains instances (${names}); set destParachainsPallet`,
  })

const detectSourceParaId = async (api: ApiPromise): Promise<number> => {
  const idCodec = await (api.query.parachainInfo as any)?.parachainId?.()
  if (idCodec) return (idCodec as any).toNumber()
  throw new Error('connectBridgeHubs: cannot auto-detect sourceParaId')
}
