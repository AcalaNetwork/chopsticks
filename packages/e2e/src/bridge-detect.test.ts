import { connectBridgeHubs } from '@acala-network/chopsticks-testing'
import { describe, expect, it } from 'vitest'

// Detection guards in connectBridgeHubs run synchronously before any network/subscription,
// so they can be tested with minimal fake apis and no live forks.

const messagesPallet = { outboundLanes: {}, outboundMessages: {} }
const parachainsPallet = { parasInfo: {}, importedParaHeads: {} }
const txMessagesPallet = { receiveMessagesProof: () => {} }
const parachainInfo = { parachainId: async () => ({ toNumber: () => 1000 }) }
const signer = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY' // AddressOrPair (string)

const fakeApi = (query: Record<string, unknown>, tx: Record<string, unknown> = {}) => ({ query, tx }) as any

// A destination with everything the connector needs (messages + parachains + para id),
// so source-side detection failures surface without the destination erroring first.
const validDest = () =>
  fakeApi({ bridgePolkadotParachains: parachainsPallet, parachainInfo }, { bridgePolkadotMessages: txMessagesPallet })

describe('connectBridgeHubs pallet detection', () => {
  it('errors when the source has no pallet_bridge_messages', async () => {
    await expect(connectBridgeHubs(fakeApi({}), fakeApi({}), { signer })).rejects.toThrow(
      /no pallet_bridge_messages instance on source/,
    )
  })

  it('errors (and names them) when the source has multiple bridge-messages instances', async () => {
    const source = fakeApi({ bridgeKusamaMessages: messagesPallet, bridgeEthereumMessages: messagesPallet })
    await expect(connectBridgeHubs(source, fakeApi({}), { signer })).rejects.toThrow(
      /source has multiple bridge-messages instances .*; set sourceMessagesPallet/,
    )
  })

  it('skips source detection when sourceMessagesPallet is given (fails later, not on source)', async () => {
    // Source has no detectable messages pallet, but the explicit override bypasses detection,
    // so the next failure is the destination parachains check — not the source error.
    const err = await connectBridgeHubs(fakeApi({}), fakeApi({}), {
      signer,
      sourceMessagesPallet: 'BridgeKusamaMessages',
    }).catch((e) => (e as Error).message)
    expect(err).not.toMatch(/no pallet_bridge_messages instance on source/)
    expect(err).toMatch(/no pallet_bridge_parachains instance on destination/)
  })

  it('errors when the destination has no pallet_bridge_parachains', async () => {
    const source = fakeApi({ bridgeKusamaMessages: messagesPallet })
    await expect(connectBridgeHubs(source, fakeApi({}), { signer })).rejects.toThrow(
      /no pallet_bridge_parachains instance on destination/,
    )
  })

  it('errors when the source para id cannot be auto-detected', async () => {
    const source = fakeApi({ bridgeKusamaMessages: messagesPallet }) // no parachainInfo
    const dest = fakeApi({ bridgePolkadotParachains: parachainsPallet }, { bridgePolkadotMessages: txMessagesPallet })
    await expect(connectBridgeHubs(source, dest, { signer })).rejects.toThrow(/cannot auto-detect sourceParaId/)
  })

  it('errors when the source has no pallet_bridge_parachains (needed for delivery confirmations)', async () => {
    // Source can deliver and resolve its para id, but lacks the bridge-parachains pallet
    // the reverse confirmation proof requires.
    const source = fakeApi({ bridgeKusamaMessages: messagesPallet, parachainInfo })
    await expect(connectBridgeHubs(source, validDest(), { signer })).rejects.toThrow(
      /no pallet_bridge_parachains instance on source/,
    )
  })

  it('errors when the destination para id cannot be auto-detected', async () => {
    const source = fakeApi({
      bridgeKusamaMessages: messagesPallet,
      bridgeKusamaParachains: parachainsPallet,
      parachainInfo,
    })
    // Destination has messages + parachains but no parachainInfo to resolve destParaId.
    const dest = fakeApi({ bridgePolkadotParachains: parachainsPallet }, { bridgePolkadotMessages: txMessagesPallet })
    await expect(connectBridgeHubs(source, dest, { signer })).rejects.toThrow(/cannot auto-detect destParaId/)
  })

  // A fully-detectable source, so destination-side ambiguity surfaces (not a source error first).
  const validSource = () =>
    fakeApi({ bridgeKusamaMessages: messagesPallet, bridgeKusamaParachains: parachainsPallet, parachainInfo })

  it('errors (and names them) when the destination has multiple bridge-messages instances', async () => {
    const dest = fakeApi(
      { bridgePolkadotParachains: parachainsPallet, parachainInfo },
      { bridgePolkadotMessages: txMessagesPallet, bridgeEthereumMessages: txMessagesPallet },
    )
    await expect(connectBridgeHubs(validSource(), dest, { signer })).rejects.toThrow(
      /destination has multiple bridge-messages instances .*; set destMessagesPallet/,
    )
  })

  it('errors (and names them) when the source has multiple bridge-parachains instances', async () => {
    const source = fakeApi({
      bridgeKusamaMessages: messagesPallet,
      bridgeKusamaParachains: parachainsPallet,
      bridgeEthereumParachains: parachainsPallet,
      parachainInfo,
    })
    await expect(connectBridgeHubs(source, validDest(), { signer })).rejects.toThrow(
      /source has multiple bridge-parachains instances .*; set sourceParachainsPallet/,
    )
  })

  it('errors (and names them) when the destination has multiple bridge-parachains instances', async () => {
    const dest = fakeApi(
      { bridgePolkadotParachains: parachainsPallet, bridgeEthereumParachains: parachainsPallet, parachainInfo },
      { bridgePolkadotMessages: txMessagesPallet },
    )
    await expect(connectBridgeHubs(validSource(), dest, { signer })).rejects.toThrow(
      /destination has multiple bridge-parachains instances .*; set destParachainsPallet/,
    )
  })

  it('explicit overrides bypass dest-messages and both parachains ambiguity checks', async () => {
    // Ambiguous on dest-messages, source-parachains, and dest-parachains — but each is overridden,
    // so detection is skipped and the next failure is the (unrelated) live-connection phase, never
    // a 'multiple instances' error.
    const source = fakeApi({
      bridgeKusamaMessages: messagesPallet,
      bridgeKusamaParachains: parachainsPallet,
      bridgeEthereumParachains: parachainsPallet,
      parachainInfo,
    })
    const dest = fakeApi(
      { bridgePolkadotParachains: parachainsPallet, bridgeEthereumParachains: parachainsPallet, parachainInfo },
      { bridgePolkadotMessages: txMessagesPallet, bridgeEthereumMessages: txMessagesPallet },
    )
    const err = await connectBridgeHubs(source, dest, {
      signer,
      destMessagesPallet: 'BridgePolkadotMessages',
      destParachainsPallet: 'BridgePolkadotParachains',
      sourceParachainsPallet: 'BridgeKusamaParachains',
    }).catch((e) => (e as Error).message)
    expect(err ?? '').not.toMatch(/multiple .*instances/)
  })
})
