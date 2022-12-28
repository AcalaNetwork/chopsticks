import { BN, hexToU8a, u8aToHex } from '@polkadot/util'
import { HexString } from '@polkadot/util/types'
import { Slot } from '@polkadot/types/interfaces'

import { Blockchain } from '../blockchain'
import { compactHex } from '.'
import { getAuraSlotDuration } from '../executor'
import { setStorage } from './set-storage'

export const getCurrentSlot = async (chain: Blockchain) => {
  const meta = await chain.head.meta
  const slotRaw = meta.consts.babe
    ? await chain.head.get(compactHex(meta.query.babe.currentSlot()))
    : await chain.head.get(compactHex(meta.query.aura.currentSlot()))
  if (!slotRaw) throw new Error('Cannot find current slot')
  return meta.registry.createType<Slot>('Slot', hexToU8a(slotRaw)).toNumber()
}

export const getCurrentTimestamp = async (chain: Blockchain) => {
  const meta = await chain.head.meta
  const currentTimestampRaw = (await chain.head.get(compactHex(meta.query.timestamp.now()))) || '0x'
  return meta.registry.createType('u64', hexToU8a(currentTimestampRaw)).toNumber()
}

export const getSlotDuration = async (chain: Blockchain) => {
  const meta = await chain.head.meta
  return meta.consts.babe
    ? (meta.consts.babe.expectedBlockTime as any as BN).toNumber()
    : meta.query.aura
    ? getAuraSlotDuration(await chain.head.wasm, meta.registry)
    : 12_000
}

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
  } else {
    // new slot
    storage.push([
      compactHex(meta.query.aura.currentSlot()),
      u8aToHex(meta.registry.createType('Slot', newSlot).toU8a()),
    ])
  }

  await setStorage(chain, storage)
}
