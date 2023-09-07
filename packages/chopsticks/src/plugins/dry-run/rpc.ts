import { HexString } from '@polkadot/util/types'
import _ from 'lodash'
import zod from 'zod'

import { Handler, ResponseError } from '../../rpc/shared'
import { decodeStorageDiff } from '../../utils/decoder'
import { generateHtmlDiff } from '../../utils/generate-html-diff'

const zHex = zod.custom<HexString>((val: any) => /^0x\w+$/.test(val))
const zHash = zod.string().length(66).and(zHex)
const zParaId = zod.string().regex(/^\d+$/).transform(Number)

const schema = zod.object({
  raw: zod.boolean().optional(),
  html: zod.boolean().optional(),
  extrinsic: zHex
    .or(
      zod.object({
        call: zHex,
        address: zHex,
      }),
    )
    .optional(),
  hrmp: zod
    .record(
      zParaId,
      zod
        .array(
          zod.object({
            sentAt: zod.number(),
            data: zHex,
          }),
        )
        .min(1),
    )
    .optional(),
  dmp: zod
    .array(
      zod.object({
        sentAt: zod.number(),
        msg: zHex,
      }),
    )
    .min(1)
    .optional(),
  ump: zod.record(zParaId, zod.array(zHex).min(1)).optional(),
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
