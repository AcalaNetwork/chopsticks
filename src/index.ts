import '@polkadot/types-codec'
import { HexString } from '@polkadot/util/types'
import { ProviderInterface } from '@polkadot/rpc-provider/types'
import { WsProvider } from '@polkadot/api'
import { u8aToHex } from '@polkadot/util'

import { DataSource } from 'typeorm'
import { hideBin } from 'yargs/helpers'
import { readFileSync, writeFileSync } from 'node:fs'
import yaml from 'js-yaml'
import yargs from 'yargs'

import { Api } from './api'
import { Blockchain } from './blockchain'
import { BuildBlockMode } from './blockchain/txpool'
import { Config, configSchema } from './schema'
import { GenesisProvider } from './genesis-provider'
import {
  InherentProviders,
  SetBabeRandomness,
  SetNimbusAuthorInherent,
  SetTimestamp,
  SetValidationData,
} from './blockchain/inherents'
import { createServer } from './server'
import { defaultLogger } from './logger'
import { handler } from './rpc'
import { importStorage, overrideWasm } from './utils/import-storage'
import { openDb } from './db'
import { runTask } from './executor'

export const setup = async (argv: Config) => {
  let provider: ProviderInterface
  if (argv.genesis) {
    if (typeof argv.genesis === 'string') {
      provider = await GenesisProvider.fromUrl(argv.genesis)
    } else {
      provider = new GenesisProvider(argv.genesis)
    }
  } else {
    provider = new WsProvider(argv.endpoint)
  }
  const api = new Api(provider)
  await api.isReady

  let blockHash: string
  if (argv.block == null) {
    blockHash = await api.getBlockHash()
  } else if (Number.isInteger(argv.block)) {
    blockHash = await api.getBlockHash(Number(argv.block))
  } else {
    blockHash = argv.block as string
  }

  defaultLogger.info({ ...argv, blockHash }, 'Args')

  let db: DataSource | undefined
  if (argv.db) {
    db = await openDb(argv.db)
  }

  const header = await api.getHeader(blockHash)

  const blockNumber = +header.number
  const timestamp = argv.timestamp ?? Date.now()
  const setTimestamp = new SetTimestamp((newBlockNumber) => {
    return timestamp + (newBlockNumber - blockNumber) * 12000 // TODO: make this more flexible
  })
  const inherents = new InherentProviders(setTimestamp, [
    new SetValidationData(),
    new SetNimbusAuthorInherent(),
    new SetBabeRandomness(),
  ])

  const chain = new Blockchain({
    api,
    buildBlockMode: argv['build-block-mode'],
    inherentProvider: inherents,
    db,
    header: {
      hash: blockHash,
      number: Number(header.number),
    },
  })

  const context = { chain, api, ws: provider }

  await importStorage(chain, argv['import-storage'])
  await overrideWasm(chain, argv['wasm-override'])

  return context
}

export const setupWithServer = async (argv: Config) => {
  const context = await setup(argv)
  const port = argv.port || Number(process.env.PORT) || 8000

  const { close } = createServer(port, handler(context))

  if (argv.genesis) {
    // mine 1st block when starting from genesis to set some mock validation data
    await context.chain.newBlock()
  }

  return {
    ...context,
    close,
  }
}

export const runBlock = async (argv: Config) => {
  const context = await setupWithServer(argv)

  const header = await context.chain.head.header
  const parent = header.parentHash.toHex()
  const wasm = await context.chain.head.wasm
  const block = context.chain.head

  const calls: [string, HexString][] = [['Core_initialize_block', header.toHex()]]

  for (const extrinsic of await block.extrinsics) {
    calls.push(['BlockBuilder_apply_extrinsic', extrinsic])
  }

  calls.push(['BlockBuilder_finalize_block', '0x' as HexString])

  const result = await runTask({
    blockHash: parent,
    wasm,
    calls,
    storage: [],
    mockSignatureHost: false,
    allowUnresolvedImports: false,
  })

  if (argv['output-path']) {
    writeFileSync(argv['output-path'], JSON.stringify(result, null, 2))
  } else {
    console.dir(result, { depth: null, colors: false })
  }

  await context.close()
  setTimeout(() => process.exit(0), 50)
}

export const decodeKey = async (argv: any) => {
  const context = await setup(argv)

  const key = argv.key
  const meta = await context.chain.head.meta
  outer: for (const module of Object.values(meta.query)) {
    for (const storage of Object.values(module)) {
      const keyPrefix = u8aToHex(storage.keyPrefix())
      if (key.startsWith(keyPrefix)) {
        const decodedKey = meta.registry.createType('StorageKey', key)
        decodedKey.setMeta(storage.meta)
        console.log(`${storage.section}.${storage.method}`, decodedKey.args.map((x) => x.toHuman()).join(', '))
        break outer
      }
    }
  }

  setTimeout(() => process.exit(0), 50)
}

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
