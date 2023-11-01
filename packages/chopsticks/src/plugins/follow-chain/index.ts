import { Header } from '@polkadot/types/interfaces'
import { defaultLogger } from '@acala-network/chopsticks-core'
import _ from 'lodash'
import type yargs from 'yargs'

import { createServer } from '../../server'
import { defaultOptions } from '../../cli-options'
import { handler } from '../../rpc'
import { setupContext } from '../../context'
import type { Config } from '../../schema'

const logger = defaultLogger.child({ name: 'follow-chain' })
const options = _.pick(defaultOptions, ['endpoint', 'wasm-override', 'runtime-log-level', 'offchain-worker'])

export const cli = (y: yargs.Argv) => {
  y.command(
    'follow-chain',
    'Always follow the latest block on upstream',
    (yargs) =>
      yargs.options({
        ...options,
        'head-mode': {
          desc: 'Head mode',
          choices: ['latest', 'finalized'],
          default: 'finalized',
        },
        port: {
          desc: 'Port to listen on',
          number: true,
        },
      }),
    async (argv) => {
      const port = argv.port ?? 8000
      const endpoint = argv.endpoint as string
      if (/^(https|http):\/\//.test(endpoint || '')) {
        throw Error('http provider is not supported')
      }

      const context = await setupContext(argv as Config, true)
      const chain = context.chain

      // TODO: fix subscribe
      await chain.api[argv['head-mode'] === 'latest' ? 'subscribeRemoteNewHeads' : 'subscribeRemoteFinalizedHeads'](
        async (error, header: Header) => {
          try {
            if (error) throw error

            logger.info({ header: header.toJSON() }, `New ${argv['head-mode']} head from upstream`)
            const block = await chain.getBlock(header.hash.toHex())
            if (!block) throw Error(`cant find block ', ${header.hash.toHex()}`)
            logger.info({ blockNumber: block?.number }, 'New block')

            // TODO: run block
            // await chain.setHead(block)
          } catch (e) {
            logger.error(e)
            await close()
          }
        },
      )

      const { close, port: listenPort } = await createServer(handler(context), port)

      logger.info(`${await context.chain.api.getSystemChain()} RPC listening on port ${listenPort}`)
    },
  )
}
