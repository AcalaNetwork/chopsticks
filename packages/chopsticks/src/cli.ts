import { config as dotenvConfig } from 'dotenv'
import { hideBin } from 'yargs/helpers'
import _ from 'lodash'
import yargs from 'yargs'

import { Blockchain, BuildBlockMode, connectParachains, connectVertical, setupWithServer } from '.'
import { Config, fetchConfig } from './schema'
import { pluginExtendCli } from './plugins'

dotenvConfig()

const processArgv: yargs.MiddlewareFunction<{ config?: string; port?: number }> = async (argv) => {
  if (argv.config) {
    Object.assign(argv, _.defaults(argv, await fetchConfig(argv.config)))
  }
  argv.port = argv.port ?? (process.env.PORT ? Number(process.env.PORT) : 8000)
}

export const defaultOptions = {
  endpoint: {
    desc: 'Endpoint to connect to',
    string: true,
  },
  block: {
    desc: 'Block hash or block number. Default to latest block',
    string: true,
  },
  'wasm-override': {
    desc: 'Path to wasm override',
    string: true,
  },
  db: {
    desc: 'Path to database',
    string: true,
  },
  config: {
    desc: 'Path to config file with default options',
    string: true,
  },
  'runtime-log-level': {
    desc: 'Runtime maximum log level [off = 0; error = 1; warn = 2; info = 3; debug = 4; trace = 5]',
    number: true,
  },
  'offchain-worker': {
    desc: 'Enable offchain worker',
    boolean: true,
  },
}

export const mockOptions = {
  'import-storage': {
    desc: 'Pre-defined JSON/YAML storage file path',
    string: true,
  },
  'mock-signature-host': {
    desc: 'Mock signature host so any signature starts with 0xdeadbeef and filled by 0xcd is considered valid',
    boolean: true,
  },
}

const commands = yargs(hideBin(process.argv))
  .scriptName('chopsticks')
  .middleware(processArgv, true)
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
  .strict()
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

pluginExtendCli(commands).then(() => commands.parse())
