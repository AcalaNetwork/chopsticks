import { hexToU8a } from '@polkadot/util'

import { Blockchain } from '../blockchain'
import { DownwardMessage } from '../blockchain/txpool'
import { compactHex, getParaId } from '../utils'
import { logger } from '.'
import { setStorage } from '../utils/set-storage'

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

    if (downwardMessages.length === 0) return

    logger.debug({ downwardMessages }, 'downward_message')
    await parachain.newBlock({ inherent: { downwardMessages } })
  })
}
