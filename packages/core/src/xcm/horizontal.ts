import { HexString } from '@polkadot/util/types'
import { hexToU8a } from '@polkadot/util'

import { Blockchain } from '../blockchain/index.js'
import { compactHex, getParaId } from '../utils/index.js'
import { xcmLogger } from './index.js'

export const connectHorizontal = async (parachains: Record<number, Blockchain>, relaychain: Blockchain | undefined) => {
  for (const [id, chain] of Object.entries(parachains)) {
    const meta = await chain.head.meta

    const hrmpOutboundMessagesKey = compactHex(meta.query.parachainSystem.hrmpOutboundMessages())

    await chain.headState.subscribeStorage([hrmpOutboundMessagesKey], async (head, pairs) => {
      const value = pairs[0][1]
      if (!value) return

      const meta = await head.meta

      const outboundHrmpMessage = meta.registry
        .createType('Vec<PolkadotCorePrimitivesOutboundHrmpMessage>', hexToU8a(value))
        .toJSON() as any as { recipient: number; data: HexString }[]

      xcmLogger.info({ outboundHrmpMessage }, 'outboundHrmpMessage')

      for (const { recipient, data } of outboundHrmpMessage) {
        const receiver = parachains[recipient]
        if (receiver) {
          receiver.submitHorizontalMessages(Number(id), [{ sentAt: head.number, data }])
        }
      }
    })

    const relayMeta = await relaychain?.head.meta

    if (relayMeta) {
      const paraId = await getParaId(chain)
      const hrmpEgressChannelsIndex = compactHex(relayMeta.query.hrmp.hrmpEgressChannelsIndex(paraId))
      const hrmpIngressChannelsIndex = compactHex(relayMeta.query.hrmp.hrmpIngressChannelsIndex(paraId))
      const storageKeys = [hrmpEgressChannelsIndex, hrmpIngressChannelsIndex]

      await relaychain?.headState.subscribeStorage(storageKeys, async (head, pairs) => {
        const meta = await head.meta
        let hrmpEgressChannels: number[] = []
        let hrmpIngressChannels: number[] = []

        for (const [key, value] of pairs) {
          if (key === hrmpEgressChannelsIndex) {
            hrmpEgressChannels = meta.registry.createType('Vec<u32>', hexToU8a(value)).toJSON() as number[]
          } else if (key === hrmpIngressChannelsIndex) {
            hrmpIngressChannels = meta.registry.createType('Vec<u32>', hexToU8a(value)).toJSON() as number[]
          } else {
            return
          }
        }

        xcmLogger.info({ paraId: Number(id), egress: hrmpEgressChannels, ingress: hrmpIngressChannels }, 'hrmpChannels')
        chain.openHrmpChannels(Number(id), { egress: hrmpEgressChannels, ingress: hrmpIngressChannels })
      })
    }
  }
}
