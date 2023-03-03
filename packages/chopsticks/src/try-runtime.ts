import { HexString } from '@polkadot/util/types'
import { writeFileSync } from 'node:fs'

import { Config } from './schema'
import { generateHtmlDiffPreviewFile } from './utils/generate-html-diff'
import { openHtml } from './utils/open-html'
import { runTask, taskHandler } from './executor'
import { setup } from './setup'

export const tryRuntime = async (argv: Config) => {
  const context = await setup(argv)
  const wasm = await context.chain.head.wasm
  const block = context.chain.head
  const parent = await block.parentBlock
  if (!parent) throw Error('cant find parent block')
  const registry = await block.registry
  registry.register({
    UpgradeCheckSelect: {
      _enum: {
        None: null,
      },
    },
  })

  const select_none = registry.createType('UpgradeCheckSelect', 'None')
  const calls: [string, HexString[]][] = [['TryRuntime_on_runtime_upgrade', [select_none.toHex()]]]
  const result = await runTask(
    {
      wasm,
      calls,
      storage: [],
      mockSignatureHost: false,
      allowUnresolvedImports: false,
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
