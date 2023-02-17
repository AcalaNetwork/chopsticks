import { Config } from './schema'
import { createServer } from './server'
import { handler } from './rpc'
import { logger } from './rpc/shared'
import { setup } from './setup'

export const setupWithServer = async (argv: Config) => {
  const context = await setup(argv)
  const port = argv.port || Number(process.env.PORT) || 8000

  if (argv.genesis) {
    // mine 1st block when starting from genesis to set some mock validation data
    await context.chain.newBlock()
  }

  const { close, port: listenPort } = await createServer(handler(context), port)

  logger.info(`${await context.chain.api.getSystemChain()} RPC listening on port ${listenPort}`)

  return {
    ...context,
    close,
    listenPort,
  }
}
