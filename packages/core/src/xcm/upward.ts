import { hexToU8a } from '@polkadot/util'

import { Blockchain } from '../blockchain/index.js'
import { compactHex, getParaId } from '../utils/index.js'

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

    relaychain.submitUpwardMessages(
      paraId,
      upwardMessages.map((x) => x.toHex()),
    )
  })
}
