import { hideBin } from 'yargs/helpers'
import { readFileSync } from 'node:fs'
import yaml from 'js-yaml'
import yargs from 'yargs'

import { BuildBlockMode } from './blockchain/txpool'
import { configSchema } from './schema'
import { connectDownward, connectParachains } from './xcm'
import { decodeKey } from './decode-key'
import { runBlock } from './run-block'
import { setupWithServer } from './setup-with-server'

const processConfig = (path: string) => {
  const configFile = readFileSync(path, 'utf8')
  const config = yaml.load(configFile) as any
  return configSchema.parse(config)
}

const processArgv = (argv: any) => {
  if (argv.config) {
    return { ...processConfig(argv.config), ...argv }
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
    async (argv) => {
      await runBlock(processArgv(argv))
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
    async (argv) => {
      await setupWithServer(processArgv(argv))
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
    async (argv) => {
      await decodeKey(processArgv(argv))
    }
  )
  .command(
    'xcm',
    'XCM setup with relaychain and parachains',
    (yargs) =>
      yargs.options({
        relaychain: {
          desc: 'Relaychain config file path',
          string: true,
          required: true,
        },
        parachain: {
          desc: 'Parachain config file path',
          type: 'array',
          string: true,
          required: true,
        },
      }),
    async (argv) => {
      const { chain: relaychain } = await setupWithServer(processConfig(argv.relaychain))
      const parachains = await Promise.all(argv.parachain.map(processConfig).map(setupWithServer))
      for (const { chain: parachain } of parachains) {
        await connectDownward(relaychain, parachain)
      }
      await connectParachains(parachains.map((x) => x.chain))
    }
  )
  .strict()
  .help()
  .alias('help', 'h').argv
