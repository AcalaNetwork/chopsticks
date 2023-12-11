import { HexString } from '@polkadot/util/types'
import { writeFileSync } from 'node:fs'
import { z } from 'zod'
import _ from 'lodash'
import type { Argv } from 'yargs'

import { runTask, taskHandler } from '@acala-network/chopsticks-core'

import { configSchema, getYargsOptions } from '../../schema/index.js'
import { generateHtmlDiffPreviewFile } from '../../utils/generate-html-diff.js'
import { openHtml } from '../../utils/open-html.js'
import { setupContext } from '../../context.js'

const schema = z.object({
  ...configSchema.shape,
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
    'run-block',
    'Replay a block',
    (yargs) => yargs.options(getYargsOptions(schema.shape)),
    async (argv) => {
      const context = await setupContext(schema.parse(argv), true)

      const header = await context.chain.head.header
      const block = context.chain.head
      const parent = await block.parentBlock
      if (!parent) throw Error('cant find parent block')
      const wasm = await parent.wasm

      const calls: [string, HexString[]][] = [['Core_initialize_block', [header.toHex()]]]

      for (const extrinsic of await block.extrinsics) {
        calls.push(['BlockBuilder_apply_extrinsic', [extrinsic]])
      }

      calls.push(['BlockBuilder_finalize_block', []])

      const result = await runTask(
        {
          wasm,
          calls,
          mockSignatureHost: false,
          allowUnresolvedImports: false,
          runtimeLogLevel: (argv.runtimeLogLevel as number) || 0,
        },
        taskHandler(parent),
      )

      if ('Error' in result) {
        throw new Error(result.Error)
      }

      if (argv.html) {
        const filePath = await generateHtmlDiffPreviewFile(parent, result.Call.storageDiff, block.hash)
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
