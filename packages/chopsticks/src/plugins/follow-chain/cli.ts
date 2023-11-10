import { Block, defaultLogger, runTask, taskHandler } from '@acala-network/chopsticks-core'
import { Header } from '@polkadot/types/interfaces'
import { HexString } from '@polkadot/util/types'
import _ from 'lodash'
import type { Argv } from 'yargs'

import { createServer } from '../../server.js'
import { defaultOptions } from '../../cli-options.js'
import { handler } from '../../rpc/index.js'
import { setupContext } from '../../context.js'
import type { Config } from '../../schema/index.js'

const logger = defaultLogger.child({ name: 'follow-chain' })
const options = _.pick(defaultOptions, ['endpoint', 'wasm-override', 'runtime-log-level', 'offchain-worker'])

export const cli = (y: Argv) => {
  y.command(
    'follow-chain',
    'Always follow the latest block on upstream',
    (yargs) =>
      yargs.options({
        ...options,
        port: {
          desc: 'Port to listen on',
          number: true,
        },
        'head-mode': {
          desc: 'Head mode',
          choices: ['latest', 'finalized'],
          default: 'finalized',
        },
      }),
    async (argv) => {
      const port = argv.port ?? 8000
      const endpoint = argv.endpoint as string
      if (/^(https|http):\/\//.test(endpoint || '')) {
        throw Error('http provider is not supported')
      }

      const context = await setupContext(argv as Config, true)
      const { close, port: listenPort } = await createServer(handler(context), port)
      logger.info(`${await context.chain.api.getSystemChain()} RPC listening on port ${listenPort}`)

      const chain = context.chain

      chain.api[argv.headMode === 'latest' ? 'subscribeRemoteNewHeads' : 'subscribeRemoteFinalizedHeads'](
        async (error, data) => {
          try {
            if (error) throw error
            logger.info({ header: data }, `Follow ${argv.headMode} head from upstream`)
            const parent = await chain.getBlock(data.parentHash)
            if (!parent) throw Error(`Cannot find parent', ${data.parentHash}`)
            const registry = await parent.registry
            const header = registry.createType<Header>('Header', data)
            const wasm = await parent.wasm

            const block = new Block(chain, header.number.toNumber(), header.hash.toHex(), parent)
            await chain.setHead(block)

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

            if ('Error' in result) {
              throw new Error(result.Error)
            }
          } catch (e) {
            logger.error(e, 'Error when processing new head')
            await close()
            process.exit(1)
          }
        },
      )
    },
  )
}
