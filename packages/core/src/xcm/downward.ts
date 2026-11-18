import type { Bytes, Struct, u32, u64 } from '@polkadot/types'
import { hexToU8a, u8aConcat, u8aToHex } from '@polkadot/util'
import { xxhashAsU8a } from '@polkadot/util-crypto'

import type { Blockchain } from '../blockchain/index.js'
import type { DownwardMessage } from '../blockchain/txpool.js'
import { compactHex, getParaId } from '../utils/index.js'
import { setStorage } from '../utils/set-storage.js'
import { xcmLogger } from './index.js'

export const connectDownward = async (relaychain: Blockchain, parachain: Blockchain) => {
  const meta = await relaychain.head.meta
  const paraId = await getParaId(parachain)
  const { downwardMessageQueues, downwardMessageQueueMeta } = meta.query.dmp ?? {}
  const prefix = (downwardMessageQueueMeta ?? downwardMessageQueues)?.prefix
  if (!prefix) throw new Error('Cannot find downward message queue storage in pallet Dmp')

  // Watch both layouts across runtime upgrades. During migration the legacy map can still
  // hold messages even though the runtime no longer exposes it in metadata.
  const paraIdBytes = paraId.toU8a()
  const queueKey = (name: string) =>
    u8aToHex(u8aConcat(xxhashAsU8a(prefix, 128), xxhashAsU8a(name, 128), xxhashAsU8a(paraIdBytes, 64), paraIdBytes))
  const legacyKey = downwardMessageQueues
    ? compactHex(downwardMessageQueues(paraId))
    : queueKey('DownwardMessageQueues')
  const queueMetaKey = downwardMessageQueueMeta
    ? compactHex(downwardMessageQueueMeta(paraId))
    : queueKey('DownwardMessageQueueMeta')

  const keys = [queueMetaKey, legacyKey]
  await relaychain.headState.subscribeStorage(keys, async (head, changes) => {
    if (changes.every(([, value]) => value === null)) return

    const [queueMetaValue, legacyValue] = await head.getMany(keys)
    const { query, registry } = await head.meta
    const downwardMessages: DownwardMessage[] = []
    const storage: [string, string | null][] = []

    if (queueMetaValue) {
      const { downwardMessageQueueMeta, downwardMessageQueuePages } = query.dmp
      const queueMetaType = registry.createLookupType(downwardMessageQueueMeta.meta.type.asMap.value)
      const queueMeta = registry.createType<Struct>(queueMetaType, hexToU8a(queueMetaValue))
      const firstFull = queueMeta.getT<u64>('firstFull').toBigInt()
      const firstFree = queueMeta.getT<u64>('firstFree').toBigInt()
      const pageKeys: string[] = []
      for (let index = firstFull; index < firstFree; index++) {
        pageKeys.push(compactHex(downwardMessageQueuePages(paraId, index)))
      }

      if (pageKeys.length > 0) {
        const pageType = registry.createLookupType(downwardMessageQueuePages.meta.type.asMap.value)
        const pages = await head.getMany(pageKeys)
        for (const [index, pageKey] of pageKeys.entries()) {
          const value = pages[index]
          if (!value) throw new Error(`Missing downward message queue page at ${pageKey}`)
          const page = registry.createType<Struct>(pageType, hexToU8a(value))
          downwardMessages.push({ sentAt: page.getT<u32>('sentAt').toNumber(), msg: page.getT<Bytes>('msg').toHex() })
          storage.push([pageKey, null])
        }
        // Advance the read cursor to the write cursor, as the runtime does when dropping pages.
        queueMeta.set('firstFull', queueMeta.getT<u64>('firstFree'))
        storage.push([queueMetaKey, queueMeta.toHex()])
      }
    }

    // The SDK reads the paged head before the unmigrated legacy tail.
    if (legacyValue) {
      const legacyMessages = registry
        .createType('Vec<PolkadotCorePrimitivesInboundDownwardMessage>', hexToU8a(legacyValue))
        .toJSON() as unknown as DownwardMessage[]
      downwardMessages.push(...legacyMessages)
      storage.push([legacyKey, null])
    }

    if (storage.length > 0) await setStorage(relaychain, storage, head.hash)
    if (downwardMessages.length === 0) return
    xcmLogger.debug({ downwardMessages }, 'downward_message')
    parachain.submitDownwardMessages(downwardMessages)
  })
}
