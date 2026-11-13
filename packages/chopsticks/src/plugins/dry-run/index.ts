import { z } from 'zod'
import { configSchema } from '../../schema/index.js'

export const dryRunSchema = z.object({
  ...configSchema.shape,
  extrinsic: z
    .string()
    .describe('Extrinsic or call to dry run. If you pass call here then address is required to fake signature')
    .optional(),
  address: z.string().describe('Address to fake sign extrinsic').optional(),
  preimage: z.string().describe('Preimage to dry run').optional(),
  at: z.string().describe('Block hash to dry run').optional(),
  'output-path': z.string().describe('File path to print output').optional(),
  html: z.boolean().describe('Generate html with storage diff').optional(),
  open: z.boolean().describe('Open generated html').optional(),
})

export type DryRunSchemaType = z.infer<typeof dryRunSchema>

export * from './cli.js'
export * from './rpc.js'
