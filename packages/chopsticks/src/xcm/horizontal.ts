import { HexString } from '@polkadot/util/types'
import { hexToU8a } from '@polkadot/util'

import { Blockchain } from '../blockchain'
import { HorizontalMessage } from '../blockchain/txpool'
import { compactHex } from '../utils'
import { logger } from '.'
import { setStorage } from '../utils/set-storage'

export const connectHorizontal = async (parachains: Record<number, Blockchain>) => {
  for (const [id, chain] of Object.entries(parachains)) {
    const meta = await chain.head.meta

    const hrmpOutboundMessagesKey = compactHex(meta.query.parachainSystem.hrmpOutboundMessages())

    await chain.headState.subscribeStorage([hrmpOutboundMessagesKey], async (head, pairs) => {
      const value = pairs[0][1]
      if (!value) return

      const meta = await chain.head.meta

      const hrmpOutboundMessagesKey = compactHex(meta.query.parachainSystem.hrmpOutboundMessages())

      // clear sender message queue
      await setStorage(chain, [[hrmpOutboundMessagesKey, null]], head.hash)

      const outboundHrmpMessage = meta.registry
        .createType('Vec<PolkadotCorePrimitivesOutboundHrmpMessage>', hexToU8a(value))
        .toJSON() as any as { recipient: number; data: HexString }[]

      logger.info({ outboundHrmpMessage }, 'outboundHrmpMessage')

      for (const { recipient, data } of outboundHrmpMessage) {
        const horizontalMessages: Record<number, HorizontalMessage[]> = {
          [Number(id)]: [{ sentAt: chain.head.number, data }],
        }
        const receiver = parachains[recipient]
        if (receiver) {
          await receiver.newBlock({ inherent: { horizontalMessages } })
        }
      }
    })
  }
}
