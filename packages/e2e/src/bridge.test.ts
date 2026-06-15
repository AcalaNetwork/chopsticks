import { lastDeliveredFromInbound } from '@acala-network/chopsticks'
import { decodeProof } from '@acala-network/chopsticks-core'
import { connectBridgeHubs, setupContext } from '@acala-network/chopsticks-testing'
import type { ApiPromise } from '@polkadot/api'
import { Keyring } from '@polkadot/keyring'
import { compactAddLength, nToU8a, u8aConcat, u8aToHex } from '@polkadot/util'
import type { HexString } from '@polkadot/util/types'
import { cryptoWaitReady } from '@polkadot/util-crypto'
import { describe, expect, it } from 'vitest'

import { delay } from './helper.js'

const LANE_ID: HexString = '0x00000001'

// BHP's `BridgeKusamaMessages` storage keys, derived from the fork's own metadata (hashers and
// key codecs included). `OutboundMessages` is keyed by `MessageKey { lane_id, nonce }`.
const outboundLanesKey = (api: ApiPromise): HexString =>
  api.query.bridgeKusamaMessages.outboundLanes.key(LANE_ID) as HexString
const outboundMessagesKey = (api: ApiPromise, nonce: bigint): HexString =>
  api.query.bridgeKusamaMessages.outboundMessages.key({ laneId: LANE_ID, nonce }) as HexString

/**
 * `OutboundLaneData { oldest_unpruned_nonce, latest_received_nonce, latest_generated_nonce, state=Opened }`.
 *
 * `latestReceived` defaults to `latestGenerated - 1` (one message in flight). Confirmation caps at
 * the proven `total_messages`, so claiming more unconfirmed than delivered is rejected with
 * `TryingToConfirmMoreMessagesThanExpected` — pass `latestReceived` to keep them consistent.
 */
const encodeOutboundLaneData = (latestGenerated: bigint, latestReceived = latestGenerated - 1n): HexString => {
  const u64 = (v: bigint) => nToU8a(v, { bitLength: 64, isLe: true })
  return u8aToHex(u8aConcat(u64(1n), u64(latestReceived), u64(latestGenerated), new Uint8Array([0])))
}

/** `StoredMessagePayload` = `BoundedVec<u8>`. Bytes are opaque to the proof verifier. */
const encodeStoredMessagePayload = (bodyBytes: Uint8Array): HexString => u8aToHex(compactAddLength(bodyBytes))

const dbFile = (name: string) => (process.env.RUN_TESTS_WITHOUT_DB ? undefined : name)

/**
 * Fork BHP + BHK, fund Alice on both, wire the bridge connector, and read the source's
 * current `latest_generated_nonce`. Returns the contexts (for the caller's `finally`
 * teardown) plus the next two free nonces to inject. BHK's `is_obsolete` signed
 * extension rejects nonces <= last_delivered_nonce, so messages must be injected above
 * the live baseline.
 *
 * The connector confirms deliveries back to BHP (`receive_messages_delivery_proof`), which
 * submits there too, so Alice is funded on both sides.
 */
const setupBridge = async () => {
  await cryptoWaitReady()
  const bhp = await setupContext({
    endpoint: 'wss://polkadot-bridge-hub-rpc.polkadot.io',
    db: dbFile('bridge-bhp-tests.sqlite'),
  })
  const bhk = await setupContext({
    endpoint: 'wss://kusama-bridge-hub-rpc.polkadot.io',
    db: dbFile('bridge-bhk-tests.sqlite'),
  })
  const alice = new Keyring({ type: 'sr25519' }).addFromUri('//Alice')
  // Real bridge-hub forks don't have Alice funded.
  const fundAlice = {
    System: { Account: [[[alice.address], { providers: 1, data: { free: 1_000_000_000_000_000n } }]] },
  }
  await bhk.dev.setStorage(fundAlice)
  await bhp.dev.setStorage(fundAlice)
  const handle = await connectBridgeHubs(bhp.api, bhk.api, { signer: alice })
  const current = (await bhp.api.query.bridgeKusamaMessages.outboundLanes(LANE_ID)).toJSON() as {
    latestGeneratedNonce?: number | string
  } | null
  const baselineNonce = BigInt(current?.latestGeneratedNonce ?? 0)
  return { bhp, bhk, handle, nonceA: baselineNonce + 1n, nonceB: baselineNonce + 2n }
}

describe.skipIf(process.env.CI && !process.env.RUN_BRIDGE_E2E)('bridge connector', () => {
  it('delivers outbound messages continuously as source progresses', async () => {
    const { bhp, bhk, handle, nonceA, nonceB } = await setupBridge()

    try {
      // Message 1: a message produced right after connect is delivered (no baseline absorbs it).
      await bhp.dev.setStorage([
        [outboundMessagesKey(bhp.api, nonceA), encodeStoredMessagePayload(new Uint8Array([0xde, 0xad]))],
        [outboundLanesKey(bhp.api), encodeOutboundLaneData(nonceA)],
      ])
      await bhp.dev.newBlock()
      expect(await waitForInboundDelivered(bhk, nonceA, 60_000)).toBeGreaterThanOrEqual(nonceA)

      // Message 2 in a separate block: inbound nonce advances to nonceB.
      await bhp.dev.setStorage([
        [outboundMessagesKey(bhp.api, nonceB), encodeStoredMessagePayload(new Uint8Array([0xbe, 0xef]))],
        [outboundLanesKey(bhp.api), encodeOutboundLaneData(nonceB)],
      ])
      await bhp.dev.newBlock()
      expect(await waitForInboundDelivered(bhk, nonceB, 60_000)).toBeGreaterThanOrEqual(nonceB)

      await handle.disconnect()
    } finally {
      await bhp.teardown()
      await bhk.teardown()
    }
  }, 240_000)

  it('rapid-fire source blocks: both nonces reach destination without deadlock', async () => {
    const { bhp, bhk, handle, nonceA, nonceB } = await setupBridge()

    try {
      await bhp.dev.newBlock() // baseline

      // Two source blocks back-to-back, no awaiting the connector between them. The connector
      // tracks the latest generated nonce and pushes one chunk at a time (in-flight guard), so it
      // serializes nonceA then nonceB as BHK applies each — no gapped/duplicate proof.
      await bhp.dev.setStorage([
        [outboundMessagesKey(bhp.api, nonceA), encodeStoredMessagePayload(new Uint8Array([0xaa]))],
        [outboundLanesKey(bhp.api), encodeOutboundLaneData(nonceA)],
      ])
      await bhp.dev.newBlock()
      await bhp.dev.setStorage([
        [outboundMessagesKey(bhp.api, nonceB), encodeStoredMessagePayload(new Uint8Array([0xbb]))],
        [outboundLanesKey(bhp.api), encodeOutboundLaneData(nonceB)],
      ])
      await bhp.dev.newBlock()

      // Both nonces must reach BHK's inbound lane (advanced synchronously inside
      // receive_messages_proof dispatch) — robust to the back-to-back delivery ordering.
      const lastDelivered = await waitForInboundDelivered(bhk, nonceB, 90_000)

      await handle.disconnect()

      expect(lastDelivered).toBeGreaterThanOrEqual(nonceB)
    } finally {
      await bhp.teardown()
      await bhk.teardown()
    }
  }, 240_000)

  it('delivers a multi-nonce range proven in a single block', async () => {
    const { bhp, bhk, handle, nonceA, nonceB } = await setupBridge()

    try {
      // One source block carries TWO new messages (latest_generated jumps by 2), so a single push
      // delivers the whole [nonceA..=nonceB] range in one proof (noncesEnd > start) — exercising the
      // per-nonce key loop and multi-message weight, which single-message blocks never reach. Both
      // are in flight, so latest_received = nonceA - 1.
      await bhp.dev.setStorage([
        [outboundMessagesKey(bhp.api, nonceA), encodeStoredMessagePayload(new Uint8Array([0x11]))],
        [outboundMessagesKey(bhp.api, nonceB), encodeStoredMessagePayload(new Uint8Array([0x22]))],
        [outboundLanesKey(bhp.api), encodeOutboundLaneData(nonceB, nonceA - 1n)],
      ])
      await bhp.dev.newBlock()

      // Both nonces must arrive; nonceA alone passing would mean the second nonce in the range
      // was dropped (gap/off-by-one in the proof loop).
      expect(await waitForInboundDelivered(bhk, nonceB, 90_000)).toBeGreaterThanOrEqual(nonceB)

      await handle.disconnect()
    } finally {
      await bhp.teardown()
      await bhk.teardown()
    }
  }, 240_000)

  // The connector only pushes proofs to the destination pool; it never builds blocks. So delivery
  // must work whatever produces the destination's blocks — verify all three build modes.
  for (const mode of ['Manual', 'Instant', 'Batch'] as const) {
    it(`delivers under ${mode} destination build mode`, async () => {
      const { bhp, bhk, handle, nonceA } = await setupBridge()

      try {
        // Manual: nothing auto-builds, so the host (here, the test) drives a BHK block.
        // Instant/Batch: submitting the proof makes BHK auto-build, so we only poll (drive=false) —
        // proving the bridge applies deliveries hands-off, with no block driving at all.
        await bhk.ws.send('dev_setBlockBuildMode', [mode])

        await bhp.dev.setStorage([
          [outboundMessagesKey(bhp.api, nonceA), encodeStoredMessagePayload(new Uint8Array([0x5a]))],
          [outboundLanesKey(bhp.api), encodeOutboundLaneData(nonceA)],
        ])
        await bhp.dev.newBlock() // source head → connector pushes the delivery to BHK's pool

        const delivered = await waitForInboundDelivered(bhk, nonceA, 90_000, mode === 'Manual')
        expect(delivered).toBeGreaterThanOrEqual(nonceA)

        await handle.disconnect()
      } finally {
        await bhp.teardown()
        await bhk.teardown()
      }
    }, 240_000)
  }

  it('relays delivery confirmations back to the source across rounds (idempotent, no double-confirm)', async () => {
    const { bhp, bhk, handle, nonceA, nonceB } = await setupBridge()

    const sendAndConfirm = async (nonce: bigint, body: number) => {
      await bhp.dev.setStorage([
        [outboundMessagesKey(bhp.api, nonce), encodeStoredMessagePayload(new Uint8Array([body]))],
        [outboundLanesKey(bhp.api), encodeOutboundLaneData(nonce)],
      ])
      await bhp.dev.newBlock()
      // Forward delivery lands on BHK first (the connector builds the BHK block)...
      expect(await waitForInboundDelivered(bhk, nonce, 90_000)).toBeGreaterThanOrEqual(nonce)
      // ...the connector, watching BHK heads, then submits receive_messages_delivery_proof to
      // BHP's pool — but doesn't build source blocks, so we drive BHP blocks here. Once one
      // includes the confirmation, the source lane's latest_received_nonce advances. Without
      // the confirmation relay it stays at the injected baseline forever.
      expect(await waitForSourceConfirmed(bhp, nonce, 90_000)).toBeGreaterThanOrEqual(nonce)
    }

    try {
      await sendAndConfirm(nonceA, 0xc0)
      // A second round drives confirmation again: the connector's `confirmed` map must not
      // re-confirm nonceA, and the idempotency guard (source latest_received already covers it)
      // must let nonceB's confirmation through cleanly while building extra BHP blocks that
      // re-fire pumpConfirm against the already-confirmed lane.
      await sendAndConfirm(nonceB, 0xde)

      await handle.disconnect()
    } finally {
      await bhp.teardown()
      await bhk.teardown()
    }
  }, 240_000)

  it('dev_getReadProof produces a valid absence proof for a non-existent key', async () => {
    const bhp = await setupContext({
      endpoint: 'wss://polkadot-bridge-hub-rpc.polkadot.io',
      db: dbFile('bridge-bhp-tests.sqlite'),
    })

    try {
      // An OutboundMessages nonce that definitely doesn't exist on the lane.
      const absentKey = outboundMessagesKey(bhp.api, 999_999_999n)
      const { proof, stateRoot } = (await bhp.ws.send('dev_getReadProof', [[absentKey]])) as {
        proof: HexString[]
        stateRoot: HexString
      }

      expect(proof.length).toBeGreaterThan(0)
      // decodeProof verifies the nodes against the recomputed root and returns the present
      // keys: a valid absence proof decodes without throwing and omits the absent key.
      const decoded = await decodeProof(stateRoot, proof)
      expect(decoded[absentKey]).toBeUndefined()
    } finally {
      await bhp.teardown()
    }
  }, 120_000)

  it('dev_getReadProof binds the proof to its state root (a wrong root yields no value)', async () => {
    const bhp = await setupContext({
      endpoint: 'wss://polkadot-bridge-hub-rpc.polkadot.io',
      db: dbFile('bridge-bhp-tests.sqlite'),
    })

    try {
      // System.Number is always present, so this proves the *presence* path (not just absence).
      const presentKey = bhp.api.query.system.number.key() as HexString
      const { proof, stateRoot } = (await bhp.ws.send('dev_getReadProof', [[presentKey]])) as {
        proof: HexString[]
        stateRoot: HexString
      }

      // Under the correct (recomputed) root the key decodes to a value...
      const decoded = await decodeProof(stateRoot, proof)
      expect(decoded[presentKey]).toBeDefined()

      // ...but the proof is bound to that root: verifying the same nodes against a tampered root
      // must not yield the value. This is the property the whole relay trust model rests on —
      // the destination only trusts a proof that recomputes to the imported state root.
      const tampered = (stateRoot.slice(0, -2) + (stateRoot.endsWith('00') ? '11' : '00')) as HexString
      const decodedWrong = await decodeProof(tampered, proof).catch(() => ({}) as Record<string, HexString>)
      expect(decodedWrong[presentKey]).toBeUndefined()
    } finally {
      await bhp.teardown()
    }
  }, 120_000)
})

type BridgeTestContext = { api: { query: any }; dev: { newBlock: () => Promise<unknown> } }

/** Poll `read` until it reaches `target` or `timeoutMs` elapses, building a block before each
 * poll when `drive` is set (for build modes where nothing applies the connector's pushes). */
const waitForNonce = async (
  ctx: BridgeTestContext,
  read: () => Promise<bigint>,
  target: bigint,
  timeoutMs: number,
  drive: boolean,
): Promise<bigint> => {
  const deadline = Date.now() + timeoutMs
  let latest = 0n
  while (Date.now() < deadline) {
    if (drive) await ctx.dev.newBlock()
    latest = await read()
    if (latest >= target) return latest
    await delay(500)
  }
  return latest
}

/**
 * Wait until BHK's `BridgePolkadotMessages.InboundLanes[lane].last_delivered_nonce` reaches
 * `target`. The connector pushes `receive_messages_proof` to BHK's pool but builds no blocks, so
 * who applies it depends on BHK's build mode: under `Manual` we drive blocks here (`drive: true`);
 * under `Instant`/`Batch` the chain auto-applies, so we only poll (`drive: false`). Each built block
 * also lets the connector react (on the resulting head) and push the next chunk.
 */
const waitForInboundDelivered = (ctx: BridgeTestContext, target: bigint, timeoutMs: number, drive = true) =>
  waitForNonce(
    ctx,
    async () => lastDeliveredFromInbound((await ctx.api.query.bridgePolkadotMessages.inboundLanes(LANE_ID)).toJSON()),
    target,
    timeoutMs,
    drive,
  )

/**
 * Drive BHP blocks until its source `BridgeKusamaMessages.OutboundLanes[lane].latest_received_nonce`
 * reaches `target`. The connector submits `receive_messages_delivery_proof` to BHP's pool but
 * leaves block production to the (here, test) driver, so each poll builds a block to include it.
 */
const waitForSourceConfirmed = (ctx: BridgeTestContext, target: bigint, timeoutMs: number) =>
  waitForNonce(
    ctx,
    async () =>
      BigInt(
        (
          (await ctx.api.query.bridgeKusamaMessages.outboundLanes(LANE_ID)).toJSON() as {
            latestReceivedNonce?: number | string
          } | null
        )?.latestReceivedNonce ?? 0,
      ),
    target,
    timeoutMs,
    true,
  )
