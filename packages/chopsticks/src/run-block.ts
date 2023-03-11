import { HexString } from '@polkadot/util/types'
import { writeFileSync } from 'node:fs'

import { Config } from './schema'
import { generateHtmlDiffPreviewFile } from './utils/generate-html-diff'
import { openHtml } from './utils/open-html'
import { runTask, taskHandler } from './executor'
import { setup } from './setup'

export const runBlock = async (argv: Config) => {
  const context = await setup(argv, true)

  const header = await context.chain.head.header
  const wasm = await context.chain.head.wasm
  const block = context.chain.head
  const parent = await block.parentBlock
  if (!parent) throw Error('cant find parent block')

  const calls: [string, HexString[]][] = [['Core_initialize_block', [header.toHex()]]]

  for (const extrinsic of await block.extrinsics) {
    calls.push(['BlockBuilder_apply_extrinsic', [extrinsic]])
  }

  calls.push(['BlockBuilder_finalize_block', []])

  const result = await runTask(
    {
      wasm,
      calls,
      storage: [],
      mockSignatureHost: false,
      allowUnresolvedImports: false,
      runtimeLogLevel: argv['runtime-log-level'] || 0,
    },
    taskHandler(parent)
  )

  if (result.Error) {
    throw new Error(result.Error)
  }

  if (argv['html']) {
    const filePath = await generateHtmlDiffPreviewFile(parent, result.Call.storageDiff, block.hash)
    console.log(`Generated preview ${filePath}`)
    if (argv['open']) {
      openHtml(filePath)
    }
  } else if (argv['output-path']) {
    writeFileSync(argv['output-path'], JSON.stringify(result, null, 2))
  } else {
    console.dir(result, { depth: null, colors: false })
  }

  process.exit(0)
}
