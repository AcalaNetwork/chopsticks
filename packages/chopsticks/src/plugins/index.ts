import { Handlers } from '@acala-network/chopsticks-core'
import _ from 'lodash'
import type { Argv } from 'yargs'

import { defaultLogger } from '../logger'

const logger = defaultLogger.child({ name: 'plugin' })

export const pluginHandlers: Handlers = {}

const plugins = [
  'decode-key',
  'dry-run',
  'follow-chain',
  'new-block',
  'run-block',
  'set-block-build-mode',
  'set-head',
  'set-runtime-log-level',
  'set-storage',
  'time-travel',
  'try-runtime',
]

;(async () => {
  for (const plugin of plugins) {
    const { rpc, name } = await import(`./${plugin}`)
    if (rpc) {
      const methodName = name || _.camelCase(plugin)
      pluginHandlers[`dev_${methodName}`] = rpc
      logger.debug(`Registered plugin ${plugin} RPC`)
    }
  }
})()

export const pluginExtendCli = async (y: Argv) => {
  for (const plugin of plugins) {
    const { cli } = await import(`./${plugin}`)
    if (cli) {
      cli(y)
      logger.debug(`Registered plugin ${plugin} CLI`)
    }
  }
}
