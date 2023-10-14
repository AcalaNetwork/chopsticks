import { Header } from '@polkadot/types/interfaces'
import { HexString } from '@polkadot/util/types'

import { Handler, ResponseError } from '../shared'

const processHeader = (header: Header) => {
  const res = header.toJSON() as any
  res.number = '0x' + res.number.toString(16) // number is hex format
  return res
}

/**
 * @param context
 * @param params - [`blockNumber`]
 *
 * @return Block hash
 */
export const chain_getBlockHash: Handler<[number], HexString> = async (context, [blockNumber]) => {
  const block = await context.chain.getBlockAt(blockNumber)
  if (!block) {
    throw new ResponseError(1, `Block #${blockNumber} not found`)
  }
  return block.hash
}

/**
 * @param context
 * @param params - [`blockhash`]
 *
 * @return Header - see `@polkadot/types/interfaces`
 */
export const chain_getHeader: Handler<[HexString], Header> = async (context, [hash]) => {
  const block = await context.chain.getBlock(hash)
  if (!block) {
    throw new ResponseError(1, `Block ${hash} not found`)
  }
  return processHeader(await block.header)
}

/**
 * @param context
 * @param params - [`blockhash`]
 *
 * @return Block header and extrinsics
 */
export const chain_getBlock: Handler<
  [HexString],
  { block: { header: Header; extrinsics: HexString[] }; justifications: null }
> = async (context, [hash]) => {
  const block = await context.chain.getBlock(hash)
  if (!block) {
    throw new ResponseError(1, `Block ${hash} not found`)
  }
  return {
    block: {
      header: await block.header,
      extrinsics: await block.extrinsics,
    },
    justifications: null,
  }
}

/**
 * @param context
 *
 * @return head hash
 */
export const chain_getFinalizedHead: Handler<void, HexString> = async (context) => {
  return context.chain.head.hash
}

export const chain_subscribeNewHead: Handler<void, string> = async (context, _params, { subscribe }) => {
  let update = () => {}

  const id = context.chain.headState.subscribeHead(() => update())
  const callback = subscribe('chain_newHead', id, () => context.chain.headState.unsubscribeHead(id))

  update = async () => {
    callback(processHeader(await context.chain.head.header))
  }

  update()

  return id
}

export const chain_subscribeFinalizedHeads: Handler<void, string> = async (context, _params, { subscribe }) => {
  let update = () => {}

  const id = context.chain.headState.subscribeHead(() => update())
  const callback = subscribe('chain_finalizedHead', id, () => context.chain.headState.unsubscribeHead(id))

  update = async () => {
    callback(processHeader(await context.chain.head.header))
  }

  update()

  return id
}

export const chain_unsubscribeNewHead: Handler<[string], void> = async (_context, [subid], { unsubscribe }) => {
  unsubscribe(subid)
}

export const chain_getHead = chain_getBlockHash
export const chain_subscribeNewHeads = chain_subscribeNewHead
export const chain_unsubscribeNewHeads = chain_unsubscribeNewHead
export const chain_unsubscribeFinalizedHeads = chain_unsubscribeNewHead
