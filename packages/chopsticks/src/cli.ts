import { HexString } from '@polkadot/util/types'
import { hideBin } from 'yargs/helpers'
import { readFileSync } from 'node:fs'
import axios from 'axios'
import yaml from 'js-yaml'
import yargs from 'yargs'

import { Blockchain, BuildBlockMode, connectParachains, connectVertical, setup, setupWithServer } from '.'
import { configSchema } from './schema'
import { decodeKey } from './utils/decoder'
import { dryRun } from './dry-run'
import { dryRunPreimage } from './dry-run-preimage'
import { isUrl } from './utils'
import { runBlock } from './run-block'
import { tryRuntime } from './try-runtime'

const processConfig = async (path: string) => {
  let file: string
  if (isUrl(path)) {
    file = await axios.get(path).then((x) => x.data)
  } else {
    file = readFileSync(path, 'utf8')
  }
  const config = yaml.load(file) as any
  return configSchema.parse(config)
}

const processArgv = async (argv: any) => {
  if (argv.config) {
    argv = { ...(await processConfig(argv.config)), ...argv }
  }
  argv.port = argv.port ?? (process.env.PORT ? Number(process.env.PORT) : 8000)
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
      await runBlock(await processArgv(argv))
    }
  )
yargs(hideBin(process.argv))
  .scriptName('chopsticks')
  .command(
    'try-runtime',
    'Runs runtime upgrade',
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
      await tryRuntime(await processArgv(argv))
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
        },
        address: {
          desc: 'Address to fake sign extrinsic',
          string: true,
        },
        preimage: {
          desc: 'Preimage to dry run',
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
      const config = await processArgv(argv)
      if (config.preimage) {
        await dryRunPreimage(config)
      } else {
        await dryRun(config)
      }
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
      await setupWithServer(await processArgv(argv))
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
      const context = await setup(await processArgv(argv))
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
        const { chain } = await setupWithServer(await processConfig(config))
        parachains.push(chain)
      }

      if (parachains.length > 1) {
        await connectParachains(parachains)
      }

      if (argv.relaychain) {
        const { chain: relaychain } = await setupWithServer(await processConfig(argv.relaychain))
        for (const parachain of parachains) {
          await connectVertical(relaychain, parachain)
        }
      }
    }
  )
  .strict()
  .help()
  .alias('help', 'h').argv
