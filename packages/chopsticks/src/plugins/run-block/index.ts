import type yargs from 'yargs'

import { HexString } from '@polkadot/util/types'
import { defaultOptions, mockOptions } from '../../cli-options'
import { writeFileSync } from 'node:fs'

import { Config } from '../../schema'
import { defaultLogger } from '../../logger'
import { generateHtmlDiffPreviewFile } from '../../utils/generate-html-diff'
import { openHtml } from '../../utils/open-html'
import { runTask, taskHandler } from '../../executor'
import { setup } from '../../setup'

export const cli = (y: yargs.Argv) => {
  y.command(
    'run-block',
    'Replay a block',
    (yargs) =>
      yargs.options({
        ...defaultOptions,
        ...mockOptions,
        'output-path': {
          desc: 'File path to print output',
          string: true,
        },
        html: {
          desc: 'Generate html with storage diff',
        },
        open: {
          desc: 'Open generated html',
        },
      }),
    async (argv) => {
      const context = await setup(argv as Config, true)

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

      if (result.Error) {
        throw new Error(result.Error)
      }

      for (const logs of result.Call.runtimeLogs) {
        defaultLogger.info(`RuntimeLogs:\n${logs}`)
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
