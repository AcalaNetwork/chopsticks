import { defaultLogger } from '@acala-network/chopsticks-core'
import { setupContext } from './context.js'
import { handler } from './rpc/index.js'
import type { Config } from './schema/index.js'
import { createServer } from './server.js'

export const setupWithServer = async (argv: Config) => {
  if (argv.addr) {
    defaultLogger.warn({}, `⚠️ Option --addr is deprecated, please use --host instead.`)
    argv.host ??= argv.addr
  }
  const context = await setupContext(argv)

  const { close, addr } = await createServer(handler(context), argv.port, argv.host)
  defaultLogger.info(`${await context.chain.api.getSystemChain()} RPC listening on http://${addr} and ws://${addr}`)

  return {
    ...context,
    addr,
    async close() {
      await context.chain.close()
      await context.fetchStorageWorker?.terminate()
      await close()
    },
  }
}
