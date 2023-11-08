import { config as dotenvConfig } from 'dotenv'
import { hideBin } from 'yargs/helpers'
import _ from 'lodash'
import yargs from 'yargs'
import type { MiddlewareFunction } from 'yargs'

import { Blockchain, BuildBlockMode, connectParachains, connectVertical } from '@acala-network/chopsticks-core'
import { Config, fetchConfig } from './schema/index.js'
import { defaultOptions, mockOptions } from './cli-options.js'
import { pluginExtendCli } from './plugins/index.js'
import { setupWithServer } from './index.js'

dotenvConfig()

const processArgv: MiddlewareFunction<{ config?: string; port?: number }> = async (argv) => {
  if (argv.config) {
    Object.assign(argv, _.defaults(argv, await fetchConfig(argv.config)))
  }
  argv.port = argv.port ?? (process.env.PORT ? Number(process.env.PORT) : 8000)
}

const commands = yargs(hideBin(process.argv))
  .scriptName('chopsticks')
  .middleware(processArgv, false)
  .command(
    '*',
    'Dev mode, fork off a chain',
    (yargs) =>
      yargs.options({
        ...defaultOptions,
        ...mockOptions,
        port: {
          desc: 'Port to listen on',
          number: true,
        },
        'build-block-mode': {
          desc: 'Build block mode. Default to Batch',
          enum: [BuildBlockMode.Batch, BuildBlockMode.Manual, BuildBlockMode.Instant],
        },
        'allow-unresolved-imports': {
          desc: 'Allow wasm unresolved imports',
          boolean: true,
        },
        'max-memory-block-count': {
          desc: 'Max memory block count',
          number: true,
        },
        resume: {
          desc: `Resume from the specified block hash or block number in db.
                 If true, it will resume from the latest block in db.
                 Note this will override the block option`,
          string: true,
        },
      }),
    async (argv) => {
      await setupWithServer(argv as Config)
    },
  )
  .command(
    'xcm',
    'XCM setup with relaychain and parachains',
    (yargs) =>
      yargs
        .options({
          relaychain: {
            desc: 'Relaychain config file path',
            string: true,
          },
          parachain: {
            desc: 'Parachain config file path',
            type: 'array',
            string: true,
            required: true,
          },
        })
        .alias('relaychain', 'r')
        .alias('parachain', 'p'),
    async (argv) => {
      const parachains: Blockchain[] = []
      for (const config of argv.parachain) {
        const { chain } = await setupWithServer(await fetchConfig(config))
        parachains.push(chain)
      }

      if (parachains.length > 1) {
        await connectParachains(parachains)
      }

      if (argv.relaychain) {
        const { chain: relaychain } = await setupWithServer(await fetchConfig(argv.relaychain))
        for (const parachain of parachains) {
          await connectVertical(relaychain, parachain)
        }
      }
    },
  )
  .help()
  .alias('help', 'h')
  .alias('version', 'v')
  .alias('config', 'c')
  .alias('endpoint', 'e')
  .alias('port', 'p')
  .alias('block', 'b')
  .alias('import-storage', 's')
  .alias('wasm-override', 'w')
  .usage('Usage: $0 <command> [options]')
  .example('$0', '-c acala')

if (!process.env.DISABLE_PLUGINS) {
  pluginExtendCli(commands).then(() => commands.strict().help().parse())
} else {
  commands.strict().parse()
}
