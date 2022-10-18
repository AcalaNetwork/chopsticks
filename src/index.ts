import { ApiPromise } from '@polkadot/api'
import { WsProvider } from '@polkadot/rpc-provider'
import { hideBin } from 'yargs/helpers'
import { spawn } from 'child_process'
import yargs from 'yargs'

import { createServer } from './server'
import { defaultLogger } from './logger'
import { handler } from './rpc'
import State from './state'

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

  const state = new State(api, blockHash)

  defaultLogger.info(
    {
      endpoint: argv.endpoint,
      blockHash,
    },
    'Args'
  )

  const listeningPort = await createServer(port, handler({ state, api }))

  return listeningPort
}

const main = async (argv: any) => {
  const listeningPort = await setup(argv)

  const executorCmd = argv['executor-cmd']

  const cmd = `${executorCmd} --runner-url=ws://localhost:${listeningPort}`

  spawn(cmd, { shell: true, stdio: 'inherit' })
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
      main(argv).catch((err) => {
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
      }),
    (argv) => {
      setup(argv).catch((err) => {
        console.error(err)
        process.exit(1)
      })
    }
  )
  .help().argv
