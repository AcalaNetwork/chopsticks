import { writeFileSync } from 'node:fs'

import { Config } from './schema'
import { generateHtmlDiffPreviewFile } from './utils/generate-html-diff'
import { openHtml } from './utils/open-html'
import { setup } from './setup'

export const tryRuntime = async (argv: Config) => {
  const context = await setup(argv)
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

  if (argv['html']) {
    const filePath = await generateHtmlDiffPreviewFile(block, result.storageDiff, block.hash)
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
