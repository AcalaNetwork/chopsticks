import { outboundLanesStorageKey, outboundMessagesStorageKey } from '@acala-network/chopsticks-core'
import { connectBridgeHubs, setupContext } from '@acala-network/chopsticks-testing'
import { Keyring } from '@polkadot/keyring'
import { compactToU8a, hexToU8a, u8aConcat, u8aToHex } from '@polkadot/util'
import type { HexString } from '@polkadot/util/types'
import { cryptoWaitReady } from '@polkadot/util-crypto'
import { describe, expect, it } from 'vitest'

const LANE_ID: HexString = '0x00000001'
const SOURCE_MESSAGES_PALLET = 'BridgeKusamaMessages'

/** `OutboundLaneData { oldest_unpruned_nonce, latest_received_nonce, latest_generated_nonce, state=Opened }` */
const encodeOutboundLaneData = (latestGenerated: bigint): HexString => {
  const u64 = (v: bigint) => {
    const b = new Uint8Array(8)
    new DataView(b.buffer).setBigUint64(0, v, true)
    return b
  }
  return u8aToHex(u8aConcat(u64(1n), u64(0n), u64(latestGenerated), new Uint8Array([0])))
}

/** `StoredMessagePayload` = `BoundedVec<u8>`. Bytes are opaque to the proof verifier. */
const encodeStoredMessagePayload = (bodyBytes: Uint8Array): HexString =>
  u8aToHex(u8aConcat(compactToU8a(bodyBytes.length), bodyBytes))

const dbFile = (name: string) => (process.env.RUN_TESTS_WITHOUT_DB ? undefined : name)

/**
 * Fork BHP + BHK, fund Alice on BHK, wire the bridge connector, and read the source's
 * current `latest_generated_nonce`. Returns the contexts (for the caller's `finally`
 * teardown) plus the next two free nonces to inject. BHK's `is_obsolete` signed
 * extension rejects nonces <= last_delivered_nonce, so messages must be injected above
 * the live baseline (mirroring how real sends advance the nonce monotonically).
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
  await bhk.dev.setStorage({
    System: { Account: [[[alice.address], { providers: 1, data: { free: 1_000_000_000_000_000n } }]] },
  })
  const handle = await connectBridgeHubs(bhp.api, bhk.api, { signer: alice })
  const laneBytes = hexToU8a(LANE_ID)
  const current = (await bhp.api.query.bridgeKusamaMessages.outboundLanes(LANE_ID)).toJSON() as {
    latestGeneratedNonce?: number | string
  } | null
  const baselineNonce = BigInt(current?.latestGeneratedNonce ?? 0)
  return { bhp, bhk, handle, laneBytes, nonceA: baselineNonce + 1n, nonceB: baselineNonce + 2n }
}

describe.skipIf(process.env.CI && !process.env.RUN_BRIDGE_E2E)('bridge connector', () => {
  it('delivers outbound messages continuously as source progresses', async () => {
    const { bhp, bhk, handle, laneBytes, nonceA, nonceB } = await setupBridge()

    try {
      // First block records the connector's baseline so historical nonces don't replay.
      await bhp.dev.newBlock()

      await bhp.dev.setStorage([
        [
          outboundMessagesStorageKey(SOURCE_MESSAGES_PALLET, laneBytes, nonceA),
          encodeStoredMessagePayload(new Uint8Array([0xde, 0xad])),
        ],
        [outboundLanesStorageKey(SOURCE_MESSAGES_PALLET, laneBytes), encodeOutboundLaneData(nonceA)],
      ])
      await bhp.dev.newBlock()
      await waitForBhkEvent(bhk.api, 'bridgePolkadotMessages', 'MessagesReceived', 60_000)

      // Second message in a separate block exercises the continuous subscription.
      await bhp.dev.setStorage([
        [
          outboundMessagesStorageKey(SOURCE_MESSAGES_PALLET, laneBytes, nonceB),
          encodeStoredMessagePayload(new Uint8Array([0xbe, 0xef])),
        ],
        [outboundLanesStorageKey(SOURCE_MESSAGES_PALLET, laneBytes), encodeOutboundLaneData(nonceB)],
      ])
      await bhp.dev.newBlock()
      await waitForBhkEvent(bhk.api, 'bridgePolkadotMessages', 'MessagesReceived', 60_000)

      await handle.disconnect()
    } finally {
      await bhp.teardown()
      await bhk.teardown()
    }
  }, 240_000)

  it('rapid-fire source blocks: both nonces reach destination without deadlock', async () => {
    const { bhp, bhk, handle, laneBytes, nonceA, nonceB } = await setupBridge()

    try {
      await bhp.dev.newBlock() // baseline

      // Two source blocks back-to-back, no awaiting the connector between them.
      // Exercises the `source.at(sourceHash)` path: pumps run after both BHP
      // blocks are built, so the implicit-latest read would have caught the wrong
      // state. With the fix, deliveries succeed; without it, BHK would reject
      // proofs whose nonce range exceeds the per-block reality.
      await bhp.dev.setStorage([
        [
          outboundMessagesStorageKey(SOURCE_MESSAGES_PALLET, laneBytes, nonceA),
          encodeStoredMessagePayload(new Uint8Array([0xaa])),
        ],
        [outboundLanesStorageKey(SOURCE_MESSAGES_PALLET, laneBytes), encodeOutboundLaneData(nonceA)],
      ])
      await bhp.dev.newBlock()
      await bhp.dev.setStorage([
        [
          outboundMessagesStorageKey(SOURCE_MESSAGES_PALLET, laneBytes, nonceB),
          encodeStoredMessagePayload(new Uint8Array([0xbb])),
        ],
        [outboundLanesStorageKey(SOURCE_MESSAGES_PALLET, laneBytes), encodeOutboundLaneData(nonceB)],
      ])
      await bhp.dev.newBlock()

      // Wait for BHK's `InboundLanes.last_delivered_nonce` (encoded inside the
      // VecDeque<UnrewardedRelayer>) to reach `nonceB`. The runtime advances this
      // synchronously inside `receive_messages_proof` dispatch.
      const deadline = Date.now() + 90_000
      let lastDelivered = 0n
      while (Date.now() < deadline && lastDelivered < nonceB) {
        const inbound = (await bhk.api.query.bridgePolkadotMessages.inboundLanes(LANE_ID)).toJSON() as {
          relayers?: { messages?: { end?: number | string } }[]
        } | null
        const last = inbound?.relayers?.[inbound.relayers.length - 1]?.messages?.end
        if (last != null) lastDelivered = BigInt(last)
        if (lastDelivered >= nonceB) break
        await new Promise((r) => setTimeout(r, 500))
      }

      await handle.disconnect()

      expect(lastDelivered).toBeGreaterThanOrEqual(nonceB)
    } finally {
      await bhp.teardown()
      await bhk.teardown()
    }
  }, 240_000)
})

const waitForBhkEvent = async (
  api: { query: any; rpc: any },
  palletCamel: string,
  method: string,
  timeoutMs: number,
): Promise<void> => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const events = (await api.query.system.events()) as any
    for (const record of events) {
      const ev = record.event
      if (ev.section === palletCamel && ev.method === method) return
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`timeout waiting for ${palletCamel}.${method} on destination`)
}
