import { configSchema } from '../../schema/index.js'
import { z } from 'zod'

export const dryRunSchema = z.object({
  ...configSchema.shape,
  extrinsic: z
    .string({
      description: 'Extrinsic or call to dry run. If you pass call here then address is required to fake signature',
    })
    .optional(),
  address: z
    .string({
      description: 'Address to fake sign extrinsic',
    })
    .optional(),
  preimage: z
    .string({
      description: 'Preimage to dry run',
    })
    .optional(),
  at: z
    .string({
      description: 'Block hash to dry run',
    })
    .optional(),
  ['output-path']: z
    .string({
      description: 'File path to print output',
    })
    .optional(),
  html: z
    .boolean({
      description: 'Generate html with storage diff',
    })
    .optional(),
  open: z
    .boolean({
      description: 'Open generated html',
    })
    .optional(),
})

export type DryRunSchemaType = z.infer<typeof dryRunSchema>

export * from './cli.js'
export * from './rpc.js'
