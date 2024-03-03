import { Context, ResponseError, zHex } from '../shared.js'
import { HexString } from '@polkadot/util/types'
import { z } from 'zod'

import { defaultLogger } from '../../logger.js'

const schema = z.object({
  count: z.number().optional(),
  to: z.number().optional(),
  dmp: z
    .array(
      z.object({
        sentAt: z.number(),
        msg: zHex,
      }),
    )
    .min(1)
    .optional(),
  ump: z.record(z.number(), z.array(zHex).min(1)).optional(),
  hrmp: z
    .record(
      z.union([z.number(), z.string()]),
      z
        .array(
          z.object({
            sentAt: z.number(),
            data: zHex,
          }),
        )
        .min(1),
    )
    .optional(),
  transactions: z.array(zHex).min(1).optional(),
  unsafeBlockHeight: z.number().optional(),
})

type Params = z.infer<typeof schema>

export interface NewBlockParams {
  /**
   * The number of blocks to build
   */
  count: Params['count']
  /**
   * The block number to build to
   */
  to: Params['to']
  /**
   * The downward messages to include in the block
   */
  dmp: Params['dmp']
  /**
   * The upward messages to include in the block
   */
  ump: Params['ump']
  /**
   * The horizontal messages to include in the block
   */
  hrmp: Params['hrmp']
  /**
   * The transactions to include in the block
   */
  transactions: Params['transactions']
  /**
   * Build block using a specific block height (unsafe)
   */
  unsafeBlockHeight: Params['unsafeBlockHeight']
}

/**
 * Build new blocks.
 *
 * This function is a dev rpc handler. Use `dev_newBlock` as the method name when calling it.
 *
 * @param context - The context object of the rpc handler
 * @param params - The parameters of the rpc handler
 *
 * @example Build 2 blocks
 * ```ts
 * import { WsProvider } from '@polkadot/rpc-provider'
 * const ws = new WsProvider(`ws://localhost:8000`)
 * await ws.send('dev_newBlock', [{ count: 2 }])
 * ```
 * @example Build a block with upward messages
 * ```ts
 * import { WsProvider } from '@polkadot/rpc-provider'
 * const ws = new WsProvider(`ws://localhost:8000`)
 * await ws.send('dev_newBlock', [
 *  {
 *    ump: {
 *      // https://acala.subscan.io/xcm_message/polkadot-ff66f28818d0b74573e62db8317e354b253fbc80
 *      2000: [
 *        '0x021000040000000007903fc4db080a130000000007903fc4db08000d010004000101009c4b11a0974cba4a395c94832fba812868a6cb0ba09e8519b3521093ea359905',
 *      ],
 *    }
 *  }
 * ])
 * ```
 *
 * @example Build two blocks with unsafeBlockHeight
 * ```ts
 * import { WsProvider } from '@polkadot/rpc-provider'
 * const ws = new WsProvider(`ws://localhost:8000`)
 * // this will create two blocks with block height 100000001 and 100000002
 * await ws.send('dev_newBlock', [{ count: 2, unsafeBlockHeight: 100000001 }])
 * ```
 */
export const dev_newBlock = async (context: Context, [params]: [NewBlockParams]) => {
  const { count, to, hrmp, ump, dmp, transactions, unsafeBlockHeight } = schema.parse(params || {})
  const now = context.chain.head.number
  const diff = to ? to - now : count
  const finalCount = diff !== undefined ? Math.max(diff, 1) : 1

  let finalHash: HexString | undefined
  if (unsafeBlockHeight !== undefined && unsafeBlockHeight <= now) {
    throw new ResponseError(1, 'unsafeBlockHeight must be greater than current block height')
  }

  for (let i = 0; i < finalCount; i++) {
    const block = await context.chain
      .newBlock({
        transactions,
        horizontalMessages: hrmp,
        upwardMessages: ump,
        downwardMessages: dmp,
        unsafeBlockHeight: i === 0 ? unsafeBlockHeight : undefined,
      })
      .catch((error) => {
        throw new ResponseError(1, error.toString())
      })
    defaultLogger.debug({ hash: block.hash }, 'dev_newBlock')
    finalHash = block.hash
  }

  return finalHash!
}
