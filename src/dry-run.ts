import { blake2AsHex } from '@polkadot/util-crypto'
import { exec } from 'node:child_process'
import { writeFileSync } from 'node:fs'

import { Config } from './schema'
import { generateHtmlDiff } from './utils/generate-html-diff'
import { setup } from './setup'

export const dryRun = async (argv: Config) => {
  const context = await setup(argv)

  const { outcome, storageDiff } = await context.chain.dryRun(argv['extrinsic'])

  if (outcome.isErr) {
    throw new Error(outcome.asErr.toString())
  }

  if (argv['html']) {
    const filePath = await generateHtmlDiff(context.chain.head, storageDiff, blake2AsHex(argv['extrinsic'], 256))
    console.log(`Generated preview ${filePath}`)
    argv['open'] && exec(`open ${filePath}`)
  } else if (argv['output-path']) {
    writeFileSync(argv['output-path'], JSON.stringify({ outcome: outcome.toHuman(), storageDiff }, null, 2))
  } else {
    console.dir({ outcome: outcome.toHuman(), storageDiff }, { depth: null, colors: false })
  }

  process.exit(0)
}
