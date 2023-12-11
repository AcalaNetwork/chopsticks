import { Block, defaultLogger, runTask, taskHandler } from '@acala-network/chopsticks-core'
import { Header } from '@polkadot/types/interfaces'
import { HexString } from '@polkadot/util/types'
import { z } from 'zod'
import _ from 'lodash'
import type { Argv } from 'yargs'

import { configSchema, getYargsOptions } from '../../schema/index.js'
import { createServer } from '../../server.js'
import { handler } from '../../rpc/index.js'
import { setupContext } from '../../context.js'

const logger = defaultLogger.child({ name: 'follow-chain' })

enum HeadMode {
  Latest = 'Latest',
  Finalized = 'Finalized',
}

const schema = z.object({
  ..._.pick(configSchema.shape, ['endpoint', 'port', 'wasm-override', 'runtime-log-level', 'offchain-worker']),
  'head-mode': z.nativeEnum(HeadMode).default(HeadMode.Latest),
})

export const cli = (y: Argv) => {
  y.command(
    'follow-chain',
    'Always follow the latest block on upstream',
    (yargs) => yargs.options(getYargsOptions(schema.shape)),
    async (argv) => {
      const config = schema.parse(argv)
      Array.isArray(config.endpoint)
        ? config.endpoint
        : [config.endpoint || ''].forEach((endpoint) => {
            if (/^(https|http):\/\//.test(endpoint)) {
              throw Error('http provider is not supported')
            }
          })

      const context = await setupContext(config, true)
      const { close, port: listenPort } = await createServer(handler(context), config.port)
      logger.info(`${await context.chain.api.getSystemChain()} RPC listening on port ${listenPort}`)

      const chain = context.chain

      chain.api[config['head-mode'] === HeadMode.Latest ? 'subscribeRemoteNewHeads' : 'subscribeRemoteFinalizedHeads'](
        async (error, data) => {
          try {
            if (error) throw error
            logger.info({ header: data }, `Follow ${config['head-mode']} head from upstream`)
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
                runtimeLogLevel: config['runtime-log-level'] || 0,
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
