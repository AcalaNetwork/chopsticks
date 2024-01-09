import { Config } from './schema/index.js'
import { createServer } from './server.js'
import { defaultLogger } from '@acala-network/chopsticks-core'
import { handler } from './rpc/index.js'
import { setupContext } from './context.js'

export const setupWithServer = async (argv: Config) => {
  const context = await setupContext(argv)

  const { close, port: listenPort } = await createServer(handler(context), argv.port)

  defaultLogger.info(`${await context.chain.api.getSystemChain()} RPC listening on port ${listenPort}`)

  return {
    ...context,
    listenPort,
    async close() {
      await context.chain.close()
      await close()
    },
  }
}
