import { blake2AsHex } from '@polkadot/util-crypto'
import { writeFileSync } from 'node:fs'

import { Config } from '../../schema/index.js'
import { defaultLogger } from '../../logger.js'
import { generateHtmlDiffPreviewFile } from '../../utils/generate-html-diff.js'
import { openHtml } from '../../utils/open-html.js'
import { setupContext } from '../../context.js'

export const dryRunExtrinsic = async (argv: Config) => {
  const context = await setupContext(argv)

  const input = argv['address'] ? { call: argv['extrinsic'], address: argv['address'] } : argv['extrinsic']
  const { outcome, storageDiff } = await context.chain.dryRunExtrinsic(input, argv['at'])

  if (outcome.isErr) {
    throw new Error(outcome.asErr.toString())
  }

  defaultLogger.info(outcome.toHuman(), 'dry_run_outcome')

  if (argv['html']) {
    const filePath = await generateHtmlDiffPreviewFile(
      context.chain.head,
      storageDiff,
      blake2AsHex(argv['extrinsic'], 256),
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
