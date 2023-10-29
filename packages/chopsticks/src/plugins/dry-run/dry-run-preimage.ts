import { HexString } from '@polkadot/util/types'
import { blake2AsHex } from '@polkadot/util-crypto'
import { hexToU8a } from '@polkadot/util'

import { Config } from '../../schema'
import { defaultLogger } from '../../logger'
import { generateHtmlDiffPreviewFile } from '../../utils/generate-html-diff'
import { newHeader, runTask, setStorage, taskHandler } from '@acala-network/chopsticks-core'
import { openHtml } from '../../utils/open-html'
import { setupContext } from '../../context'

export const dryRunPreimage = async (argv: Config) => {
  const context = await setupContext(argv)

  const extrinsic = argv['preimage']

  const block = context.chain.head
  const registry = await block.registry

  const header = await newHeader(block)

  const data = hexToU8a(extrinsic)
  const hash = blake2AsHex(data, 256)

  await setStorage(context.chain, {
    Preimage: {
      PreimageFor: [[[[hash, data.byteLength]], extrinsic]],
      StatusFor: [
        [
          [hash],
          {
            Requested: {
              count: 1,
              len: data.byteLength,
            },
          },
        ],
      ],
    },
    Scheduler: {
      Agenda: [
        [
          [block.number + 1],
          [
            {
              maybeId: '0x64656d6f637261633a0000000000000000000000000000000000000000000000',
              priority: 63,
              call: {
                Lookup: {
                  hash: hash,
                  len: data.byteLength,
                },
              },
              origin: { system: { Root: null } },
            },
          ],
        ],
      ],
      Lookup: [[['0x64656d6f637261633a0000000000000000000000000000000000000000000000'], [block.number + 1, 0]]],
    },
  })

  const calls: [string, HexString[]][] = [['Core_initialize_block', [header.toHex()]]]

  for (const inherent of await block.chain.getInherents()) {
    calls.push(['BlockBuilder_apply_extrinsic', [inherent]])
  }

  calls.push(['BlockBuilder_finalize_block', []])

  defaultLogger.info({ preimage: registry.createType('Call', data).toHuman() }, 'Dry run preimage')

  const result = await runTask(
    {
      wasm: await block.wasm,
      calls,
      mockSignatureHost: false,
      allowUnresolvedImports: false,
      runtimeLogLevel: argv['runtime-log-level'] || 0,
    },
    taskHandler(block),
  )

  if ('Error' in result) {
    throw new Error(result.Error)
  }

  for (const logs of result.Call.runtimeLogs) {
    defaultLogger.info(`RuntimeLogs:\n${logs}`)
  }

  const filePath = await generateHtmlDiffPreviewFile(block, result.Call.storageDiff, hash)
  console.log(`Generated preview ${filePath}`)
  if (argv['open']) {
    openHtml(filePath)
  }

  // if dry-run preimage has extrinsic arguments then dry-run extrinsic
  // this is usefull to test something after preimage is applied
  if (argv['extrinsic']) {
    await context.chain.newBlock()
    const input = argv['address'] ? { call: argv['extrinsic'], address: argv['address'] } : argv['extrinsic']
    const { outcome, storageDiff } = await context.chain.dryRunExtrinsic(input)
    if (outcome.isErr) {
      throw new Error(outcome.asErr.toString())
    }

    defaultLogger.info(outcome.toHuman(), 'dry_run_outcome')

    const filePath = await generateHtmlDiffPreviewFile(
      context.chain.head,
      storageDiff,
      blake2AsHex(argv['extrinsic'], 256),
    )
    console.log(`Generated preview ${filePath}`)
    if (argv['open']) {
      openHtml(filePath)
    }
  }

  process.exit(0)
}
