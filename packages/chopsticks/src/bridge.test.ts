import { describe, expect, it } from 'vitest'

import { deriveUnrewardedRelayersState, lastDeliveredFromInbound } from './bridge.js'

// `connectBridgeHubs` hand-derives the `UnrewardedRelayersState` that the
// `receive_messages_delivery_proof` dispatch validates against the proven `InboundLaneData`
// (`InvalidUnrewardedRelayersState` on any mismatch). The live e2e only ever hits a
// one-entry/one-message queue (single relayer), so these cover the count>1 / messages>1 cases.
//
// Oracle: substrate's `impl From<&InboundLaneData> for UnrewardedRelayersState` —
//   unrewarded_relayer_entries = relayers.len()
//   messages_in_oldest_entry   = front.messages.total_messages()      (= front.end - front.begin + 1)
//   total_messages             = lane.total_unrewarded_messages()     (= back.end - front.begin + 1)
//   last_delivered_nonce       = back.messages.end (or last_confirmed_nonce when the queue is empty)
const entry = (begin: number, end: number) => ({ messages: { begin, end } })

describe('deriveUnrewardedRelayersState', () => {
  it('empty queue: zeros, last_delivered falls back to last_confirmed', () => {
    expect(deriveUnrewardedRelayersState([], 42n)).toEqual({
      unrewardedRelayerEntries: 0,
      messagesInOldestEntry: 0n,
      totalMessages: 0n,
      lastDeliveredNonce: 42n,
    })
  })

  it('single entry, single message: every field collapses to 1 (the e2e-covered case)', () => {
    expect(deriveUnrewardedRelayersState([entry(5, 5)], 5n)).toEqual({
      unrewardedRelayerEntries: 1,
      messagesInOldestEntry: 1n,
      totalMessages: 1n,
      lastDeliveredNonce: 5n,
    })
  })

  it('single entry, multiple messages: oldest == total == the entry span', () => {
    expect(deriveUnrewardedRelayersState([entry(5, 8)], 8n)).toEqual({
      unrewardedRelayerEntries: 1,
      messagesInOldestEntry: 4n,
      totalMessages: 4n,
      lastDeliveredNonce: 8n,
    })
  })

  it('two entries: total spans front.begin..=back.end, oldest is only the front entry', () => {
    // front [5..7] (3 msgs), back [8..10] (3 msgs). total = 10-5+1 = 6 (NOT a per-entry sum of 6
    // here by coincidence — see the next case where sum != span would be wrong); oldest = 3.
    expect(deriveUnrewardedRelayersState([entry(5, 7), entry(8, 10)], 10n)).toEqual({
      unrewardedRelayerEntries: 2,
      messagesInOldestEntry: 3n,
      totalMessages: 6n,
      lastDeliveredNonce: 10n,
    })
  })

  it('two entries with a tiny oldest: oldest stays the front size, not the whole queue', () => {
    // front [5..5] (1 msg), back [6..9] (4 msgs). oldest must be 1 (front only), total = 9-5+1 = 5.
    expect(deriveUnrewardedRelayersState([entry(5, 5), entry(6, 9)], 9n)).toEqual({
      unrewardedRelayerEntries: 2,
      messagesInOldestEntry: 1n,
      totalMessages: 5n,
      lastDeliveredNonce: 9n,
    })
  })

  it('three entries: count, front-only oldest, full span', () => {
    expect(deriveUnrewardedRelayersState([entry(1, 2), entry(3, 3), entry(4, 7)], 7n)).toEqual({
      unrewardedRelayerEntries: 3,
      messagesInOldestEntry: 2n,
      totalMessages: 7n,
      lastDeliveredNonce: 7n,
    })
  })

  it('parses string / hex nonces from JSON faithfully', () => {
    expect(deriveUnrewardedRelayersState([{ messages: { begin: '10', end: '0x0c' } }], 12n)).toEqual({
      unrewardedRelayerEntries: 1,
      messagesInOldestEntry: 3n,
      totalMessages: 3n,
      lastDeliveredNonce: 12n,
    })
  })
})

describe('lastDeliveredFromInbound', () => {
  it('null / empty queue → last_confirmed_nonce (0 when absent)', () => {
    expect(lastDeliveredFromInbound(null)).toBe(0n)
    expect(lastDeliveredFromInbound({ relayers: [], lastConfirmedNonce: 42 })).toBe(42n)
  })

  it('non-empty queue → last entry end (ignoring last_confirmed)', () => {
    expect(lastDeliveredFromInbound({ relayers: [entry(7, 9)], lastConfirmedNonce: 3 })).toBe(9n)
    expect(lastDeliveredFromInbound({ relayers: [entry(7, 9), entry(10, 12)], lastConfirmedNonce: 0 })).toBe(12n)
  })
})
