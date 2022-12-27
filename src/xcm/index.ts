import { HexString } from '@polkadot/util/types'
import { hexToU8a } from '@polkadot/util'

import { Blockchain } from '../blockchain'
import { DownwardMessage, HorizontalMessage } from '../blockchain/txpool'
import { compactHex, getParaId } from '../utils'
import { defaultLogger } from '../logger'
import { setStorage } from '../utils/set-storage'

const logger = defaultLogger.child({ name: 'xcm' })

export const connectDownward = async (relaychain: Blockchain, parachain: Blockchain) => {
  const meta = await relaychain.head.meta
  const paraId = await getParaId(parachain)
  const downwardMessageQueuesKey = compactHex(meta.query.dmp.downwardMessageQueues(paraId))

  await relaychain.headState.subscribeStorage([downwardMessageQueuesKey], async (head, pairs) => {
    const value = pairs[0][1]
    if (!value) return

    const meta = await relaychain.head.meta
    const downwardMessageQueuesKey = compactHex(meta.query.dmp.downwardMessageQueues(paraId))

    // clear relaychain message queue
    await setStorage(relaychain, [[downwardMessageQueuesKey, null]], head.hash)

    const downwardMessages = meta.registry
      .createType('Vec<PolkadotCorePrimitivesInboundDownwardMessage>', hexToU8a(value))
      .toJSON() as any as DownwardMessage[]

    logger.debug({ downwardMessages }, 'downward_message')
    await parachain.newBlock({ inherent: { downwardMessages } })
  })

  logger.info(
    `Connected relaychain '${await relaychain.api.getSystemChain()}' with parachain '${await parachain.api.getSystemChain()}'`
  )
}

export const connectParachains = async (parachains: Blockchain[]) => {
  const list: Record<number, Blockchain> = {}

  for (const chain of parachains) {
    const paraId = await getParaId(chain)
    list[paraId.toNumber()] = chain
  }

  await connectHorizontal(list)
}

const connectHorizontal = async (parachains: Record<number, Blockchain>) => {
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

      for (const { recipient, data } of outboundHrmpMessage) {
        logger.info({ outboundHrmpMessage }, 'outboundHrmpMessage')
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
