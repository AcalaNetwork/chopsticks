import { hexToU8a } from '@polkadot/util'

import { Blockchain } from '../blockchain/index.js'
import { DownwardMessage } from '../blockchain/txpool.js'
import { compactHex, getParaId } from '../utils/index.js'
import { setStorage } from '../utils/set-storage.js'
import { xcmLogger } from './index.js'

export const connectDownward = async (relaychain: Blockchain, parachain: Blockchain) => {
  const meta = await relaychain.head.meta
  const paraId = await getParaId(parachain)
  const downwardMessageQueuesKey = compactHex(meta.query.dmp.downwardMessageQueues(paraId))

  await relaychain.headState.subscribeStorage([downwardMessageQueuesKey], async (head, pairs) => {
    const value = pairs[0][1]
    if (!value) return

    const meta = await head.meta
    const downwardMessageQueuesKey = compactHex(meta.query.dmp.downwardMessageQueues(paraId))

    // clear relaychain message queue
    await setStorage(relaychain, [[downwardMessageQueuesKey, null]], head.hash)

    const downwardMessages = meta.registry
      .createType('Vec<PolkadotCorePrimitivesInboundDownwardMessage>', hexToU8a(value))
      .toJSON() as any as DownwardMessage[]

    if (downwardMessages.length === 0) return

    xcmLogger.debug({ downwardMessages }, 'downward_message')
    parachain.submitDownwardMessages(downwardMessages)
  })
}
