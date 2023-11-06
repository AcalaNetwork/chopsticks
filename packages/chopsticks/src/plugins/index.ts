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

export const loadRpcPlugin = async (method: string) => {
  if (pluginHandlers[method]) return pluginHandlers[method]

  const pluginName = _.snakeCase(method.split('dev_')[1])
  if (!pluginName) return undefined

  const { rpc } = await import(`./${pluginName}`)
  if (!rpc) return undefined

  pluginHandlers[method] = rpc
  logger.debug(`Registered plugin ${pluginName} RPC`)

  return rpc
}

export const pluginExtendCli = async (y: Argv) => {
  for (const plugin of plugins) {
    const { cli } = await import(`./${plugin}`)
    if (cli) {
      cli(y)
      logger.debug(`Registered plugin ${plugin} CLI`)
    }
  }
}
