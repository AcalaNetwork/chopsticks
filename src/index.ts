import '@polkadot/types-codec'
import { Api } from './api'
import { Blockchain } from './blockchain'
import { BuildBlockMode } from './blockchain/txpool'
import { Config, configSchema } from './schema'
import { DataSource } from 'typeorm'
import { GenesisProvider } from './genesis-provider'
import { HexString } from '@polkadot/util/types'
import { InherentProviders, SetTimestamp, SetValidationData } from './blockchain/inherents'
import { ProviderInterface } from '@polkadot/rpc-provider/types'
import { TaskManager } from './task'
import { WsProvider } from '@polkadot/api'
import { createServer } from './server'
import { defaultLogger } from './logger'
import { get_metadata } from '@acala-network/chopsticks-executor'
import { handler } from './rpc'
import { hexToU8a, u8aToHex } from '@polkadot/util'
import { hideBin } from 'yargs/helpers'
import { importStorage, overrideWasm } from './utils/import-storage'
import { openDb } from './db'
import { readFileSync, writeFileSync } from 'node:fs'
import yaml from 'js-yaml'
import yargs from 'yargs'

export const setup = async (argv: Config) => {
  const port = argv.port || Number(process.env.PORT) || 8000

  let wsProvider: ProviderInterface
  if (argv.genesis) {
    if (typeof argv.genesis === 'string') {
      wsProvider = await GenesisProvider.fromUrl(argv.genesis)
    } else {
      wsProvider = new GenesisProvider(argv.genesis)
    }
  } else {
    wsProvider = new WsProvider(argv.endpoint)
  }
  const api = new Api(wsProvider)
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
  const tasks = new TaskManager(port, argv['mock-signature-host'], argv['executor-cmd'])

  const setTimestamp = new SetTimestamp()
  const inherents = new InherentProviders(setTimestamp, [new SetValidationData(tasks, 1)])

  const chain = new Blockchain({
    api,
    tasks,
    buildBlockMode: argv['build-block-mode'],
    inherentProvider: inherents,
    db,
    header: {
      hash: blockHash,
      number: Number(header.number),
    },
  })

  const context = { chain, api, ws: wsProvider, tasks }

  const listeningPort = await createServer(port, handler(context)).port

  tasks.updateListeningPort(listeningPort)

  await importStorage(chain, argv['import-storage'])
  await overrideWasm(chain, argv['wasm-override'])

  if (argv.genesis) {
    // mine 1st block when starting from genesis to set some mock validation data
    await chain.newBlock()
  }

  return context
}

export const runBlock = async (argv: any) => {
  const context = await setup(argv)

  const header = await context.chain.head.header
  const parent = header.parentHash.toHex()
  const wasm = await context.chain.head.wasm
  const block = context.chain.head

  const calls: [string, string][] = [['Core_initialize_block', header.toHex()]]

  for (const extrinsic of await block.extrinsics) {
    calls.push(['BlockBuilder_apply_extrinsic', extrinsic])
  }

  calls.push(['BlockBuilder_finalize_block', '0x'])

  await context.tasks.addAndRunTask(
    {
      Call: {
        blockHash: parent,
        wasm,
        calls,
      },
    },
    (output) => {
      if (argv['output-path']) {
        writeFileSync(argv['output-path'], JSON.stringify(output, null, 2))
      } else {
        console.dir(output, { depth: null, colors: false })
      }
    }
  )

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

export const exportMetadata = async (argv: any) => {
  const wasm = u8aToHex(readFileSync(argv.wasm))
  const metadata = (await get_metadata(wasm)) as HexString
  writeFileSync('result.scale', hexToU8a(metadata.slice(10)))
}

yargs(hideBin(process.argv))
  .command(
    'run-block',
    'Replay a block',
    (yargs) =>
      yargs.options({
        port: {
          desc: 'Port to listen on',
          number: true,
        },
        endpoint: {
          desc: 'Endpoint to connect to',
          string: true,
        },
        block: {
          desc: 'Block hash or block number. Default to latest block',
          string: true,
        },
        'executor-cmd': {
          desc: 'Command to execute the executor',
          string: true,
        },
        'output-path': {
          desc: 'File path to print output',
          string: true,
        },
        db: {
          desc: 'Path to database',
          string: true,
        },
        'wasm-override': {
          desc: 'Path to wasm override',
          string: true,
        },
        config: {
          desc: 'Path to config file',
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
        port: {
          desc: 'Port to listen on',
          number: true,
        },
        endpoint: {
          desc: 'Endpoint to connect to',
          string: true,
        },
        block: {
          desc: 'Block hash or block number. Default to latest block',
          string: true,
        },
        'executor-cmd': {
          desc: 'Command to execute the executor',
          string: true,
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
        db: {
          desc: 'Path to database',
          string: true,
        },
        'wasm-override': {
          desc: 'Path to wasm override',
          string: true,
        },
        config: {
          desc: 'Path to config file',
          string: true,
        },
      }),
    (argv) => {
      setup(processConfig(argv)).catch((err) => {
        console.error(err)
        process.exit(1)
      })
    }
  )
  .command(
    'export-metadata',
    'Export SCALE metadata from runtime WASM file (not all runtimes include metadata)',
    (yargs) =>
      yargs.options({
        wasm: {
          desc: 'Path to runtime WASM file',
          string: true,
        },
      }),
    (argv) => {
      exportMetadata(processConfig(argv)).catch((err) => {
        console.error(err)
        process.exit(1)
      })
    }
  )
  .strict()
  .help().argv
