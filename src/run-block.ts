import { HexString } from '@polkadot/util/types'
import { writeFileSync } from 'node:fs'

import { Config } from './schema'
import { runTask, taskHandler } from './executor'
import { setupWithServer } from './setup-with-server'

export const runBlock = async (argv: Config) => {
  const context = await setupWithServer(argv)

  const header = await context.chain.head.header
  const wasm = await context.chain.head.wasm
  const block = context.chain.head
  const parent = await block.parentBlock
  if (!parent) throw Error('cant find parent block')

  const calls: [string, HexString][] = [['Core_initialize_block', header.toHex()]]

  for (const extrinsic of await block.extrinsics) {
    calls.push(['BlockBuilder_apply_extrinsic', extrinsic])
  }

  calls.push(['BlockBuilder_finalize_block', '0x' as HexString])

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

  if (argv['output-path']) {
    writeFileSync(argv['output-path'], JSON.stringify(result, null, 2))
  } else {
    console.dir(result, { depth: null, colors: false })
  }

  await context.close()
  setTimeout(() => process.exit(0), 50)
}
