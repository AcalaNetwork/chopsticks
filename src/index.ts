import { hideBin } from 'yargs/helpers'
import { readFileSync } from 'node:fs'
import yaml from 'js-yaml'
import yargs from 'yargs'

import { BuildBlockMode } from './blockchain/txpool'
import { configSchema } from './schema'
import { decodeKey } from './decode-key'
import { runBlock } from './run-block'
import { setupWithServer } from './setup-with-server'

const processConfig = (argv: any) => {
  if (argv.config) {
    const configFile = readFileSync(argv.config, 'utf8')
    const config = yaml.load(configFile) as any
    const parsed = configSchema.parse(config)
    return { ...parsed, ...argv }
  }
  return argv
}

const defaultOptions = {
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
    desc: 'Path to config file',
    string: true,
  },
}

yargs(hideBin(process.argv))
  .scriptName('chopsticks')
  .command(
    'run-block',
    'Replay a block',
    (yargs) =>
      yargs.options({
        ...defaultOptions,
        port: {
          desc: 'Port to listen on',
          number: true,
        },
        'output-path': {
          desc: 'File path to print output',
          string: true,
        },
      }),
    (argv) => {
      runBlock(processConfig(argv)).catch((err) => {
        console.error(err)
        process.exit(1)
      })
    }
  )
  .command(
    'dev',
    'Dev mode',
    (yargs) =>
      yargs.options({
        ...defaultOptions,
        port: {
          desc: 'Port to listen on',
          number: true,
        },
        'build-block-mode': {
          desc: 'Build block mode. Default to Batch',
          enum: [BuildBlockMode.Batch, BuildBlockMode.Manual, BuildBlockMode.Instant],
        },
        'import-storage': {
          desc: 'Pre-defined JSON/YAML storage file path',
          string: true,
        },
        'mock-signature-host': {
          desc: 'Mock signature host so any signature starts with 0xdeadbeef and filled by 0xcd is considered valid',
          boolean: true,
        },
      }),
    (argv) => {
      setupWithServer(processConfig(argv)).catch((err) => {
        console.error(err)
        process.exit(1)
      })
    }
  )
  .command(
    'decode-key <key>',
    'Deocde a key',
    (yargs) =>
      yargs
        .positional('key', {
          desc: 'Key to decode',
          type: 'string',
        })
        .options({
          ...defaultOptions,
        }),
    (argv) => {
      decodeKey(processConfig(argv)).catch((err) => {
        console.error(err)
        process.exit(1)
      })
    }
  )
  .strict()
  .help()
  .alias('help', 'h').argv
