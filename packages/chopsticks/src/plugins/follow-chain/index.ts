import { Block, defaultLogger, printRuntimeLogs, runTask, taskHandler } from '@acala-network/chopsticks-core'
import { HexString } from '@polkadot/util/types'
import _ from 'lodash'
import type { Argv } from 'yargs'

import { createServer } from '../../server.js'
import { defaultOptions } from '../../cli-options.js'
import { handler } from '../../rpc/index.js'
import { overrideWasm } from '../../utils/index.js'
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
          default: 'latest',
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

      const context = await setupContext(argv as Config)
      const { close, port: listenPort } = await createServer(handler(context), port)
      logger.info(`${await context.chain.api.getSystemChain()} RPC listening on port ${listenPort}`)

      const chain = context.chain
      let finalizedHeadSetup = false

      chain.api[argv.headMode === 'latest' ? 'subscribeRemoteNewHeads' : 'subscribeRemoteFinalizedHeads'](
        // TODO: this needs to be sequential
        async (error, data) => {
          try {
            if (error) throw error

            // first subscribe value from `subscribeRemoteNewHeads` is the current head
            // we don't need to process it. For `subscribeRemoteFinalizedHeads`, we need
            // to process the first value as it is the current finalized head and we need
            // to set head to it and override wasm.
            if (argv.headMode === 'latest' && Number(data.number) === chain.head.number) return

            logger.info(`Follow ${argv.headMode} head from upstream number: ${Number(data.number)}`)

            const parent = await chain.getBlock(data.parentHash)
            if (!parent) throw Error(`Cannot find parent', ${data.parentHash}`)
            const registry = await parent.registry
            const header = registry.createType('Header', data)

            const block = new Block(chain, header.number.toNumber(), header.hash.toHex(), parent, {
              header,
              storage: parent.storage,
            })
            await chain.setHead(block)

            // for head mode finalized, we override wasm when chain head is set to finalized head
            // for head mode latest, wasm is overriden when we call setupContext
            // TODO: if finalized then setup context with finalized head
            if (argv.headMode === 'finalized' && finalizedHeadSetup === false) {
              finalizedHeadSetup = true
              await overrideWasm(chain, argv.wasmOverride as string, block.hash)
              logger.info('Finalized head setup complete')
              return
            }

            // TODO: getting error if running block with overriden wasm ???
            // something isn't right: OFF	 [runtime::storage]:	 Corrupted state at...
            {
              // replay block
              const calls: [string, HexString[]][] = [['Core_initialize_block', [header.toHex()]]]

              for (const extrinsic of await block.extrinsics) {
                calls.push(['BlockBuilder_apply_extrinsic', [extrinsic]])
              }

              calls.push(['BlockBuilder_finalize_block', []])

              const runBlockResult = await runTask(
                {
                  wasm: await parent.wasm,
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

              {
                const blockData = registry.createType('Block', {
                  header: await block.header,
                  extrinsics: await block.extrinsics,
                })

                const select_try_state = registry.createType('TryStateSelect', 'All')

                // params: [block, false, false, TryStateSelect::All]
                const result = await block.call('TryRuntime_execute_block', [
                  blockData.toHex(),
                  '0x00',
                  '0x00',
                  select_try_state.toHex(),
                ])

                const weight = registry.createType('Weight', result.result)
                logger.info({ weight: weight.toHuman() }, 'TryRuntime_execute_block')
              }
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
