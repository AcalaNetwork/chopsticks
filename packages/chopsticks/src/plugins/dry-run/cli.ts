import { configSchema, getYargsOptions } from '../../schema/index.js'
import { dryRunExtrinsic } from './dry-run-extrinsic.js'
import { dryRunPreimage } from './dry-run-preimage.js'
import { z } from 'zod'
import type { Argv } from 'yargs'

const schema = z.object({
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

export const cli = (y: Argv) => {
  y.command(
    'dry-run',
    'Dry run an extrinsic',
    (yargs) => yargs.options(getYargsOptions(schema.shape)),
    async (argv) => {
      const config = schema.parse(argv)
      if (config.preimage) {
        await dryRunPreimage(config)
      } else {
        await dryRunExtrinsic(config)
      }
    },
  )
}
