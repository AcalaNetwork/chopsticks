import { WsProvider } from '@polkadot/rpc-provider'
import { hideBin } from 'yargs/helpers'
import yargs from 'yargs'

import { createServer } from './server'
import { handler } from './rpc'
import State from './state'

const main = async (argv: any) => {
  const port = argv.port || process.env.PORT || 8000

  const state = new State(new WsProvider(argv.endpoint))

  createServer(port, handler({ state }))
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
  })
  .help().argv
main(argv).catch((err) => {
  console.error(err)
  process.exit(1)
})
