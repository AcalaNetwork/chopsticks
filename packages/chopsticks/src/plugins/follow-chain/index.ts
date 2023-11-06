import { Block, defaultLogger, printRuntimeLogs, runTask, taskHandler } from '@acala-network/chopsticks-core'
import { Block as BlockType, Header } from '@polkadot/types/interfaces'
import { HexString } from '@polkadot/util/types'
import _ from 'lodash'
import type { Argv } from 'yargs'

import { createServer } from '../../server'
import { defaultOptions } from '../../cli-options'
import { handler } from '../../rpc'
import { setupContext } from '../../context'
import type { Config } from '../../schema'

const logger = defaultLogger.child({ name: 'follow-chain' })
const options = _.pick(defaultOptions, ['endpoint', 'wasm-override', 'runtime-log-level', 'offchain-worker'])

export const cli = (y: Argv) => {
  y.command(
    'follow-chain',
    'Always follow the latest block on upstream',
    (yargs) =>
      yargs.options({
        ...options,
        endpoint: {
          ...options.endpoint,
          required: true,
        },
        port: {
          desc: 'Port to listen on',
          number: true,
        },
        'head-mode': {
          desc: 'Head mode',
          choices: ['latest', 'finalized'],
          default: 'finalized',
        },
        'execute-block': {
          desc: 'Call TryRuntime_execute_block, make sure the wasm is provided and built with `try-runtime` feature',
          boolean: true,
        },
      }),
    async (argv) => {
      const port = argv.port ?? 8000
      const endpoint = argv.endpoint as string
      if (/^(https|http):\/\//.test(endpoint || '')) {
        throw Error('http endpoint is not supported')
      }
      if (argv.executeBlock && !argv.wasmOverride) {
        throw Error('`execute-block` requires `wasm-override`')
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

            const block = new Block(chain, header.number.toNumber(), header.hash.toHex(), parent, {
              header,
              storage: parent.storage,
            })
            await chain.setHead(block)

            {
              // replay block
              const calls: [string, HexString[]][] = [['Core_initialize_block', [header.toHex()]]]

              for (const extrinsic of await block.extrinsics) {
                calls.push(['BlockBuilder_apply_extrinsic', [extrinsic]])
              }

              calls.push(['BlockBuilder_finalize_block', []])

              const runBlockResult = await runTask(
                {
                  wasm,
                  calls,
                  mockSignatureHost: false,
                  allowUnresolvedImports: false,
                  runtimeLogLevel: (argv.runtimeLogLevel as number) || 0,
                },
                taskHandler(parent),
              )

              if ('Error' in runBlockResult) {
                throw new Error(runBlockResult.Error)
              }

              printRuntimeLogs(runBlockResult.Call.runtimeLogs)
            }

            {
              // try execute block
              if (!argv.executeBlock) return
              registry.register({
                TryStateSelect: {
                  _enum: {
                    None: null,
                    All: null,
                    RoundRobin: 'u32',
                    Only: 'Vec<Vec<u8>>',
                  },
                },
              })

              const blockData = registry.createType<BlockType>('Block', {
                header: await block.header,
                extrinsics: await block.extrinsics,
              })

              const select_try_state = registry.createType('TryStateSelect', 'All')

              const calls: [string, HexString[]][] = [
                ['TryRuntime_execute_block', [blockData.toHex(), '0x00', '0x00', select_try_state.toHex()]],
              ]

              const executeBlockResult = await runTask(
                {
                  wasm,
                  calls,
                  mockSignatureHost: false,
                  allowUnresolvedImports: false,
                  runtimeLogLevel: (argv.runtimeLogLevel as number) || 0,
                },
                taskHandler(parent),
              )

              if ('Error' in executeBlockResult) {
                throw new Error(executeBlockResult.Error)
              }
              printRuntimeLogs(executeBlockResult.Call.runtimeLogs)
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
