import { Block } from '../../blockchain/block.js'
import { Context, ResponseError, zHash } from '../shared.js'
import { z } from 'zod'

const schema = zHash.or(z.number())
type Params = z.infer<typeof schema>

/**
 * Set head.
 *
 * This function is a dev rpc handler. Use `dev_setHead` as the method name when calling it.
 *
 * @param context - The context object of the rpc handler
 * @param hashOrNumber - The block hash or number to set as head
 *
 * @example Set head to block 1000000
 * ```ts
 * import { WsProvider } from '@polkadot/rpc-provider'
 * const ws = new WsProvider(`ws://localhost:8000`)
 * await ws.send('dev_setHead', [1000000])
 * ```
 */
export const dev_setHead = async (context: Context, [params]: [Params]) => {
  const hashOrNumber = schema.parse(params)
  let block: Block | undefined
  if (typeof hashOrNumber === 'number') {
    const blockNumber = hashOrNumber > 0 ? hashOrNumber : context.chain.head.number + hashOrNumber
    block = await context.chain.getBlockAt(blockNumber)
  } else {
    block = await context.chain.getBlock(hashOrNumber)
  }
  if (!block) {
    throw new ResponseError(1, `Block not found ${hashOrNumber}`)
  }
  await context.chain.setHead(block)
  return block.hash
}
