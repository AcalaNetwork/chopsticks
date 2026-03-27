import { hexToU8a } from '@polkadot/util'

import type { Blockchain } from '../blockchain/index.js'
import { compactHex, getParaId } from '../utils/index.js'
import { xcmLogger } from './index.js'

// The UpwardMessages storage contains both XCM messages and UMP signals (e.g. SelectCore,
// ApprovedPeer for elastic scaling), separated by an empty entry (UMP_SEPARATOR).
// Only messages before the separator are XCM; everything after is signals for the relay
// chain validators. This mirrors `skip_ump_signals` in the SDK's Polkadot primitives.
// See: [`polkadot-sdk/polkadot/primitives/src/v9/mod.rs`](https://github.com/paritytech/polkadot-sdk/blob/ff555bbd5b397e9984a42c34a799de8e5449f19f/polkadot/primitives/src/v9/mod.rs#L2771)

/** Filter out UMP signals, keeping only XCM messages before the empty separator. */
export function filterXcmMessages<T extends { length: number }>(messages: T[]): T[] {
  const separatorIndex = messages.findIndex((m) => m.length === 0)
  if (separatorIndex === -1) return messages

  const signalCount = messages.length - separatorIndex - 1
  xcmLogger.debug({ xcmCount: separatorIndex, signalCount }, 'Filtered UMP signals from upward messages')
  return messages.slice(0, separatorIndex)
}

export const connectUpward = async (parachain: Blockchain, relaychain: Blockchain) => {
  const meta = await parachain.head.meta
  const paraId = (await getParaId(parachain)).toNumber()
  const upwardMessagesKey = compactHex(meta.query.parachainSystem.upwardMessages())

  await parachain.headState.subscribeStorage([upwardMessagesKey], async (_head, pairs) => {
    const value = pairs[0][1]
    if (!value) return

    const meta = await relaychain.head.meta

    const upwardMessages = meta.registry.createType('Vec<Bytes>', hexToU8a(value))
    if (upwardMessages.length === 0) return

    const xcmMessages = filterXcmMessages(upwardMessages)
    if (xcmMessages.length === 0) return

    relaychain.submitUpwardMessages(
      paraId,
      xcmMessages.map((x) => x.toHex()),
    )
  })
}
