import { HexString } from '@polkadot/util/types'
import { z } from 'zod'
import _ from 'lodash'

import { Handler, ResponseError } from '../../rpc/shared'
import { decodeStorageDiff } from '../../utils/decoder'
import { generateHtmlDiff } from '../../utils/generate-html-diff'

const zHex = z.custom<HexString>((val: any) => /^0x\w+$/.test(val))
const zHash = z.string().length(66).and(zHex)
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

// custom rpc name (optional). e.g. dryRun will be called as dev_dryRun
export const name = 'dryRun'

export const rpc: Handler = async (context, [params]) => {
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
