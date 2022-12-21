import { Config } from './schema'
import { createServer } from './server'
import { handler } from './rpc'
import { setup } from './setup'

export const setupWithServer = async (argv: Config) => {
  const context = await setup(argv)
  const port = argv.port || Number(process.env.PORT) || 8000

  const { close } = createServer(handler(context), port)

  if (argv.genesis) {
    // mine 1st block when starting from genesis to set some mock validation data
    await context.chain.newBlock()
  }

  return {
    ...context,
    close,
  }
}
