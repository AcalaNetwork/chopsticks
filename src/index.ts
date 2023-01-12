import { HexString } from '@polkadot/util/types'
import { hideBin } from 'yargs/helpers'
import { readFileSync } from 'node:fs'
import yaml from 'js-yaml'
import yargs from 'yargs'

import { Blockchain } from './blockchain'
import { BuildBlockMode } from './blockchain/txpool'
import { configSchema } from './schema'
import { connectDownward, connectParachains } from './xcm'
import { decodeKey } from './utils/decoder'
import { dryRun } from './dry-run'
import { runBlock } from './run-block'
import { setup } from './setup'
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
        html: {
          desc: 'Generate html with storage diff',
        },
        open: {
          desc: 'Open generated html',
        },
      }),
    async (argv) => {
      await runBlock(processArgv(argv))
    }
  )
  .command(
    'dry-run',
    'Dry run an extrinsic',
    (yargs) =>
      yargs.options({
        ...defaultOptions,
        extrinsic: {
          desc: 'Extrinsic or call to dry run. If you pass call here then address is required to fake signature',
          string: true,
          required: true,
        },
        address: {
          desc: 'Address to fake sign extrinsic',
          string: true,
        },
        at: {
          desc: 'Block hash to dry run',
          string: true,
        },
        'output-path': {
          desc: 'File path to print output',
          string: true,
        },
        html: {
          desc: 'Generate html with storage diff',
        },
        open: {
          desc: 'Open generated html',
        },
      }),
    async (argv) => {
      await dryRun(processArgv(argv))
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
        'allow-unresolved-imports': {
          desc: 'Allow wasm unresolved imports',
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
      const context = await setup(processArgv(argv))
      const { storage, decodedKey } = await decodeKey(context.chain.head, argv.key as HexString)
      if (storage && decodedKey) {
        console.log(
          `${storage.section}.${storage.method}`,
          decodedKey.args.map((x) => JSON.stringify(x.toHuman())).join(', ')
        )
      } else {
        console.log('Unknown')
      }
      process.exit(0)
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
        },
        parachain: {
          desc: 'Parachain config file path',
          type: 'array',
          string: true,
          required: true,
        },
      }),
    async (argv) => {
      const parachains: Blockchain[] = []
      for (const config of argv.parachain) {
        const { chain } = await setupWithServer(processConfig(config))
        parachains.push(chain)
      }

      if (parachains.length > 1) {
        await connectParachains(parachains)
      }

      if (argv.relaychain) {
        const { chain: relaychain } = await setupWithServer(processConfig(argv.relaychain))
        for (const parachain of parachains) {
          await connectDownward(relaychain, parachain)
        }
      }
    }
  )
  .strict()
  .help()
  .alias('help', 'h').argv
