import { ApiPromise } from '@polkadot/api'
import { WsProvider } from '@polkadot/rpc-provider'
import { hideBin } from 'yargs/helpers'
import yargs from 'yargs'

import { Blockchain } from './blockchain'
import { TaskManager } from './task'
import { createServer } from './server'
import { defaultLogger } from './logger'
import { handler } from './rpc'
import { wasmKey } from './rpc/shared'

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

  defaultLogger.info(
    {
      endpoint: argv.endpoint,
      blockHash,
    },
    'Args'
  )

  const header = await api.rpc.chain.getHeader(blockHash)
  const chain = new Blockchain(api, { hash: blockHash, number: header.number.toNumber() })
  const tasks = new TaskManager(argv['executor-cmd'], port)

  const context = { chain, api, ws: wsProvider, tasks }

  const listeningPort = await createServer(port, handler(context))

  tasks.updateListeningPort(listeningPort)

  return context
}

const runBlock = async (argv: any) => {
  const context = await setup(argv)

  const header = await context.chain.head.header
  const parent = header.parentHash.toHex()
  const wasm = await context.chain.head.get(wasmKey)
  const block = context.chain.head

  const calls: [string, string][] = [['Core_initialize_block', header.toHex()]]

  for (const extrinsic of await block.extrinsics) {
    calls.push(['BlockBuilder_apply_extrinsic', extrinsic])
  }

  calls.push(['BlockBuilder_finalize_block', '0x'])

  await context.tasks.addAndRunTask({
    kind: 'Call',
    blockHash: parent,
    wasm,
    calls,
  })

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
          require: true,
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
          require: true,
        },
      }),
    (argv) => {
      setup(argv).catch((err) => {
        console.error(err)
        process.exit(1)
      })
    }
  )
  .help().argv
