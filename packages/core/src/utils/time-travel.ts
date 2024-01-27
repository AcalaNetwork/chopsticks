import { BN, u8aToHex } from '@polkadot/util'
import { HexString } from '@polkadot/util/types'

import { Blockchain } from '../blockchain/index.js'
import { compactHex, getSlotDuration } from './index.js'
import { setStorage } from './set-storage.js'

export const timeTravel = async (chain: Blockchain, timestamp: number) => {
  const meta = await chain.head.meta

  const slotDuration = await getSlotDuration(chain)
  const newSlot = Math.floor(timestamp / slotDuration)

  // new timestamp
  const storage: [HexString, HexString][] = [
    [compactHex(meta.query.timestamp.now()), u8aToHex(meta.registry.createType('u64', timestamp).toU8a())],
  ]

  if (meta.consts.babe) {
    // new slot
    storage.push([
      compactHex(meta.query.babe.currentSlot()),
      u8aToHex(meta.registry.createType('Slot', newSlot).toU8a()),
    ])

    // new epoch
    const epochDuration = (meta.consts.babe.epochDuration as any as BN).toNumber()
    const newEpoch = Math.floor(timestamp / epochDuration)
    storage.push([
      compactHex(meta.query.babe.epochIndex()),
      u8aToHex(meta.registry.createType('u64', newEpoch).toU8a()),
    ])
  } else if (meta.query.aura) {
    // new slot
    storage.push([
      compactHex(meta.query.aura.currentSlot()),
      u8aToHex(meta.registry.createType('Slot', newSlot).toU8a()),
    ])
  }

  await setStorage(chain, storage)
}
