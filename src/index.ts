import { ApiPromise, WsProvider } from '@polkadot/api'
import { hideBin } from 'yargs/helpers'
import yargs from 'yargs'

import { Blockchain } from './blockchain'
import { BuildBlockMode } from './blockchain/txpool'
import { SetTimestamp } from './blockchain/inherents'
import { TaskManager } from './task'
import { createServer } from './server'
import { defaultLogger } from './logger'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { handler } from './rpc'
import { setStorage } from './utils/set-storage'
import assert from 'assert'

const setup = async (argv: any) => {
  const port = argv.port || process.env.PORT || 8000

  const wsProvider = new WsProvider(argv.endpoint)
  const api = await ApiPromise.create({ provider: wsProvider })
  await api.isReady

  let blockHash = argv.block

  if (blockHash == null) {
    blockHash = (await api.rpc.chain.getBlockHash()).toHex()
  } else if (Number.isInteger(blockHash)) {
    blockHash = (await api.rpc.chain.getBlockHash(blockHash)).toHex()
  }

  defaultLogger.info({ ...argv, blockHash }, 'Args')

  const header = await api.rpc.chain.getHeader(blockHash)
  const tasks = new TaskManager(port, argv['mock-signature-host'], argv['executor-cmd'])
  const inherents = new SetTimestamp()
  const chain = new Blockchain(api, tasks, argv['build-block-mode'], inherents, {
    hash: blockHash,
    number: header.number.toNumber(),
  })

  const context = { chain, api, ws: wsProvider, tasks }

  const listeningPort = await createServer(port, handler(context)).port

  tasks.updateListeningPort(listeningPort)

  const statePath = argv['state-path']
  if (statePath) {
    assert(existsSync(statePath), 'Invalid state path')
    const state = JSON.parse(String(readFileSync(statePath)))
    defaultLogger.trace({ state }, 'SetStorage')
    await setStorage(chain, state)
  }

  return context
}

const runBlock = async (argv: any) => {
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
      kind: 'Call',
      blockHash: parent,
      wasm,
      calls,
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
          require: true,
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
      }),
    (argv) => {
      runBlock(argv).catch((err) => {
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
          require: true,
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
        'state-path': {
          desc: 'Pre-defined JSON state file path',
          string: true,
        },
        'mock-signature-host': {
          desc: 'Mock signature host so any signature starts with 0xdeadbeef and filled by 0xcd is considered valid',
          boolean: true,
        },
      }),
    (argv) => {
      setup(argv).catch((err) => {
        console.error(err)
        process.exit(1)
      })
    }
  )
  .strict()
  .help().argv
