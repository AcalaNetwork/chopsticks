import { hexToU8a } from '@polkadot/util'

import type { Blockchain } from '../blockchain/index.js'
import { compactHex, getParaId } from '../utils/index.js'
import { xcmLogger } from './index.js'

// The UpwardMessages storage contains both XCM messages and UMP signals (e.g. SelectCore,
// ApprovedPeer for elastic scaling), separated by an empty entry (UMP_SEPARATOR).
// Only messages before the separator are XCM; everything after is signals for the relay
// chain validators. This mirrors `skip_ump_signals` in polkadot-sdk primitives.
// See: polkadot-sdk polkadot/primitives/src/v9/mod.rs
// Bytes.toHex() returns '0x' for an empty Vec<u8>.
const UMP_SEPARATOR = '0x'

/** Filter out UMP signals, keeping only XCM messages before the separator. */
export function filterXcmMessages(hexMessages: string[]): string[] {
  const separatorIndex = hexMessages.indexOf(UMP_SEPARATOR)
  if (separatorIndex === -1) return hexMessages

  const xcm = hexMessages.slice(0, separatorIndex)
  const signalCount = hexMessages.length - separatorIndex - 1
  xcmLogger.debug({ xcmCount: xcm.length, signalCount }, 'Filtered UMP signals from upward messages')
  return xcm
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

    const xcmMessages = filterXcmMessages(upwardMessages.map((x) => x.toHex()))
    if (xcmMessages.length === 0) return

    relaychain.submitUpwardMessages(paraId, xcmMessages)
  })
}
