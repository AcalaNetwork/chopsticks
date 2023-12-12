import { writeFileSync } from 'node:fs'
import { z } from 'zod'
import type { Argv } from 'yargs'

import { configSchema, getYargsOptions } from '../../schema/index.js'
import { generateHtmlDiffPreviewFile } from '../../utils/generate-html-diff.js'
import { openHtml } from '../../utils/open-html.js'
import { setupContext } from '../../context.js'

const schema = z.object({
  endpoint: configSchema.shape.endpoint,
  port: configSchema.shape.port,
  ['build-block-mode']: configSchema.shape['build-block-mode'],
  block: configSchema.shape.block,
  db: configSchema.shape.db,
  ['runtime-log-level']: configSchema.shape['runtime-log-level'],
  ['wasm-override']: z.string({
    description: 'Path to WASM built with feature `try-runtime` enabled',
  }),
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
    'try-runtime',
    'Runs runtime upgrade',
    (yargs) => yargs.options(getYargsOptions(schema.shape)),
    async (argv) => {
      const context = await setupContext(schema.parse(argv))
      const block = context.chain.head
      const registry = await block.registry
      registry.register({
        UpgradeCheckSelect: {
          _enum: {
            None: null,
          },
        },
      })

      const select_none = registry.createType('UpgradeCheckSelect', 'None')
      const result = await block.call('TryRuntime_on_runtime_upgrade', [select_none.toHex()])

      if (argv.html) {
        const filePath = await generateHtmlDiffPreviewFile(block, result.storageDiff, block.hash)
        console.log(`Generated preview ${filePath}`)
        if (argv.open) {
          openHtml(filePath)
        }
      } else if (argv.outputPath) {
        writeFileSync(argv.outputPath, JSON.stringify(result, null, 2))
      } else {
        console.dir(result, { depth: null, colors: false })
      }

      process.exit(0)
    },
  )
}
