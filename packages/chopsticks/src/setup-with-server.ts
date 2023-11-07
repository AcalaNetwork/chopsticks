import { Config } from './schema/index.js'
import { createServer } from './server.js'
import { handler } from './rpc/index.js'
import { logger } from '@acala-network/chopsticks-core'
import { setupContext } from './context.js'

export const setupWithServer = async (argv: Config) => {
  const context = await setupContext(argv)
  const port = argv.port ?? 8000

  if (argv.genesis) {
    // mine 1st block when starting from genesis to set some mock validation data
    await context.chain.newBlock()
  }

  const { close, port: listenPort } = await createServer(handler(context), port)

  logger.info(`${await context.chain.api.getSystemChain()} RPC listening on port ${listenPort}`)

  return {
    ...context,
    listenPort,
    async close() {
      await context.chain.close()
      await close()
    },
  }
}
