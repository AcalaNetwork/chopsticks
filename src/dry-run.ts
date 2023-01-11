import { blake2AsHex } from '@polkadot/util-crypto'
import { writeFileSync } from 'node:fs'

import { Config } from './schema'
import { generateHtmlDiffPreviewFile } from './utils/generate-html-diff'
import { openHtml } from './utils/open-html'
import { setup } from './setup'

export const dryRun = async (argv: Config) => {
  const context = await setup(argv)

  const { outcome, storageDiff } = await context.chain.dryRunExtrinsic(argv['extrinsic'])

  if (outcome.isErr) {
    throw new Error(outcome.asErr.toString())
  }

  if (argv['html']) {
    const filePath = await generateHtmlDiffPreviewFile(
      context.chain.head,
      storageDiff,
      blake2AsHex(argv['extrinsic'], 256)
    )
    console.log(`Generated preview ${filePath}`)
    if (argv['open']) {
      openHtml(filePath)
    }
  } else if (argv['output-path']) {
    writeFileSync(argv['output-path'], JSON.stringify({ outcome: outcome.toHuman(), storageDiff }, null, 2))
  } else {
    console.dir({ outcome: outcome.toHuman(), storageDiff }, { depth: null, colors: false })
  }

  process.exit(0)
}
