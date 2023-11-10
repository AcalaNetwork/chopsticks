import { z } from 'zod'

import { Context, ResponseError } from '@acala-network/chopsticks-core'
import { decodeStorageDiff } from '../../utils/decoder.js'
import { generateHtmlDiff } from '../../utils/generate-html-diff.js'
import { zHash, zHex } from '../../schema/index.js'

const zParaId = z.string().regex(/^\d+$/).transform(Number)

const schema = z.object({
  raw: z.boolean().optional(),
  html: z.boolean().optional(),
  extrinsic: zHex
    .or(
      z.object({
        call: zHex,
        address: zHex,
      }),
    )
    .optional(),
  hrmp: z
    .record(
      zParaId,
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
  dmp: z
    .array(
      z.object({
        sentAt: z.number(),
        msg: zHex,
      }),
    )
    .min(1)
    .optional(),
  ump: z.record(zParaId, z.array(zHex).min(1)).optional(),
  at: zHash.optional(),
})

type Params = z.infer<typeof schema>

export interface DryRunParams {
  /**
   * Return the raw storage diff
   */
  raw: Params['raw']
  /**
   * Return the html storage diff
   */
  html: Params['html']
  /**
   * The extrinsic to run
   */
  extrinsic: Params['extrinsic']
  /**
   * The horizontal messages to run
   */
  hrmp: Params['hrmp']
  /**
   * The downward messages to run
   */
  dmp: Params['dmp']
  /**
   * The upward messages to run
   */
  ump: Params['ump']
  /**
   * The block hash or number to run the extrinsic at
   */
  at: Params['at']
}

/**
 * Dry run an extrinsic or messages.
 * If `html` is true, return the generated storage diff html string.
 * If `raw` is true, return the raw storage diff.
 * Otherwise, return `{ oldState, newState, delta }`.
 *
 * This function is a dev rpc handler. Use `dev_dryRun` as the method name when calling it.
 *
 * @param context - The context object of the rpc handler
 * @param params - The parameters of the rpc handler
 *
 * @example Dry run an dmp
 * ```ts
 * import { WsProvider } from '@polkadot/rpc-provider'
 * const ws = new WsProvider(`ws://localhost:8000`)
 * const params = [
    {
      raw: false,
      dmp: [
        // https://acala.subscan.io/xcm_message/polkadot-2ab22918c567455af3563989d852f307f4cc1250
        {
          sentAt: 14471353,
          msg: '0x02100104000100000b00280b9bba030a13000100000b00280b9bba03010300286bee0d0100040001010070c53d8e216f9c0f2e3b11c53f5f4bf3e078b995d5f0ed590f889f41e20e6531',
        },
      ],
    },
  ]
 * await ws.send('dev_dryRun', params)
 * ```
 */
export const rpc = async (context: Context, [params]: [DryRunParams]) => {
  const { html, extrinsic, hrmp, dmp, ump, raw, at } = schema.parse(params)
  const dryRun = async () => {
    if (extrinsic) {
      const { outcome, storageDiff } = await context.chain.dryRunExtrinsic(extrinsic, at)
      if (outcome.isErr) {
        throw new ResponseError(1, outcome.asErr.toString())
      }
      return storageDiff
    }
    if (hrmp) {
      return context.chain.dryRunHrmp(hrmp, at)
    }
    if (dmp) {
      return context.chain.dryRunDmp(dmp, at)
    }
    if (ump) {
      return context.chain.dryRunUmp(ump, at)
    }
    throw new ResponseError(1, 'No extrinsic to run')
  }
  const storageDiff = await dryRun()
  if (html) {
    return generateHtmlDiff(context.chain.head, storageDiff)
  }
  if (raw) {
    return storageDiff
  }
  const { oldState, newState, delta } = await decodeStorageDiff(context.chain.head, storageDiff)
  return {
    old: oldState,
    new: newState,
    delta,
  }
}
