import { HexString } from '@polkadot/util/types'
import { blake2AsHex } from '@polkadot/util-crypto'
import { compactAddLength, hexToU8a } from '@polkadot/util'

import { Block, newHeader, runTask, setStorage, taskHandler } from '@acala-network/chopsticks-core'
import { DryRunSchemaType } from './index.js'
import { defaultLogger } from '../../logger.js'
import { generateHtmlDiffPreviewFile } from '../../utils/generate-html-diff.js'
import { openHtml } from '../../utils/open-html.js'
import { setupContext } from '../../context.js'

export const dryRunPreimage = async (argv: DryRunSchemaType) => {
  const context = await setupContext(argv)

  const extrinsic = argv['preimage']

  const block = context.chain.head
  const registry = await block.registry

  const header = await newHeader(block)

  const data = hexToU8a(extrinsic)
  const hash = blake2AsHex(data, 256)

  await setStorage(context.chain, {
    Preimage: {
      PreimageFor: [[[[hash, data.byteLength]], compactAddLength(data)]],
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

  const newBlockHash: HexString = `0x${Math.round(Math.random() * 100000000)
    .toString(16)
    .padEnd(64, '0')}`
  const newBlock = new Block(block.chain, block.number + 1, newBlockHash, block, {
    header,
    extrinsics: [],
    storage: block.storage,
  })

  const calls: [string, HexString[]][] = [['Core_initialize_block', [header.toHex()]]]

  for (const inherentProvider of block.chain.getInherents()) {
    const extrinsics = await inherentProvider.createInherents(newBlock, {
      transactions: [],
      downwardMessages: [],
      upwardMessages: [],
      horizontalMessages: {},
    })
    if (extrinsics.length === 0) continue
    calls.push(['BlockBuilder_apply_extrinsic', extrinsics])
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

  const filePath = await generateHtmlDiffPreviewFile(block, result.Call.storageDiff, hash)
  console.log(`Generated preview ${filePath}`)
  if (argv['open']) {
    openHtml(filePath)
  }

  // if dry-run preimage has extrinsic arguments then dry-run extrinsic
  // this is useful to test something after preimage is applied
  if (argv['extrinsic']) {
    await context.chain.newBlock()
    const input = argv['address']
      ? { call: argv['extrinsic'] as HexString, address: argv['address'] }
      : (argv['extrinsic'] as HexString)
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
