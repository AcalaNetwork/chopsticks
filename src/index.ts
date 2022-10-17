import { ApiPromise } from '@polkadot/api'
import { WsProvider } from '@polkadot/rpc-provider'
import { hideBin } from 'yargs/helpers'
import yargs from 'yargs'

import { createServer } from './server'
import { defaultLogger } from './logger'
import { handler } from './rpc'
import State from './state'

const main = async (argv: any) => {
  const port = argv.port || process.env.PORT || 8000

  const wsProvider = new WsProvider(argv.endpoint)
  const api = await ApiPromise.create({ provider: wsProvider })
  await api.isReady

  const head = argv.head || (await api.rpc.chain.getBlockHash()).toHex()

  const state = new State(api, head)

  defaultLogger.info({
    endpoint: argv.endpoint,
    head,
  })

  createServer(port, handler({ state, api }))
}

const argv = yargs(hideBin(process.argv))
  .options({
    port: {
      desc: 'Port to listen on',
      number: true,
    },
    endpoint: {
      desc: 'Endpoint to connect to',
      string: true,
    },
    head: {
      desc: 'Head block hash',
      string: true,
    },
  })
  .help().argv
main(argv).catch((err) => {
  console.error(err)
  process.exit(1)
})
