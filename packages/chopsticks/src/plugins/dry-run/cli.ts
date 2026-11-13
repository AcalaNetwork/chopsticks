import type { Argv } from 'yargs'
import { z } from 'zod'
import { configSchema, getYargsOptions } from '../../schema/index.js'
import { dryRunExtrinsic } from './dry-run-extrinsic.js'
import { dryRunPreimage } from './dry-run-preimage.js'

const schema = z.object({
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
