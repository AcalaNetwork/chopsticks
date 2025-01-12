import type { Header as CodecHeader } from '@polkadot/types/interfaces'
import { hexToNumber, isHex } from '@polkadot/util'
import type { HexString } from '@polkadot/util/types'

import type { Header } from '../../index.js'
import { type Handler, ResponseError } from '../shared.js'

const processHeader = ({ parentHash, number, stateRoot, extrinsicsRoot, digest }: CodecHeader) => {
  return {
    parentHash: parentHash.toHex(),
    number: number.toHex(),
    stateRoot: stateRoot.toHex(),
    extrinsicsRoot: extrinsicsRoot.toHex(),
    digest: {
      logs: digest.logs.map((log) => log.toHex()),
    },
  }
}

/**
 * @param context
 * @param params - [`blockNumber` | `blockNumber[]` | null]
 *
 * @return Block hash | hash[] | null
 */
export const chain_getBlockHash: Handler<
  [number | HexString | number[] | HexString[] | null],
  HexString | (HexString | null)[] | null
> = async (context, [blockNumber]) => {
  const numbers = Array.isArray(blockNumber) ? blockNumber : [blockNumber]
  const hashes = await Promise.all(
    numbers.map((n) => (isHex(n, undefined, true) ? hexToNumber(n) : n)).map((n) => context.chain.getBlockAt(n)),
  ).then((blocks) => blocks.map((b) => b?.hash || null))
  return Array.isArray(blockNumber) ? hashes : hashes[0]
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
      header: processHeader(await block.header),
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

  setTimeout(update, 50)

  return id
}

export const chain_subscribeFinalizedHeads: Handler<void, string> = async (context, _params, { subscribe }) => {
  let update = () => {}

  const id = context.chain.headState.subscribeHead(() => update())
  const callback = subscribe('chain_finalizedHead', id, () => context.chain.headState.unsubscribeHead(id))

  update = async () => {
    callback(processHeader(await context.chain.head.header))
  }

  setTimeout(update, 50)

  return id
}

export const chain_unsubscribeNewHead: Handler<[string], void> = async (_context, [subid], { unsubscribe }) => {
  unsubscribe(subid)
}

export const chain_getHead = chain_getBlockHash
export const chain_subscribeNewHeads = chain_subscribeNewHead
export const chain_unsubscribeNewHeads = chain_unsubscribeNewHead
export const chain_unsubscribeFinalizedHeads = chain_unsubscribeNewHead
