import { Handlers } from '@acala-network/chopsticks-core'
import { existsSync, lstatSync, readdirSync } from 'fs'
import _ from 'lodash'
import type { Argv } from 'yargs'

import { defaultLogger } from '../logger.js'

const logger = defaultLogger.child({ name: 'plugin' })

export const rpcPluginHandlers: Handlers = {}

// list of plugins directory
const plugins = readdirSync(new URL('.', import.meta.url)).filter((file) =>
  lstatSync(new URL(file, import.meta.url)).isDirectory(),
)

// find all rpc exports
export const rpcPluginMethods = readdirSync(new URL('.', import.meta.url))
  .filter((file) => existsSync(new URL(`${file}/rpc.ts`, import.meta.url)))
  .map((name) => `dev_${_.camelCase(name)}`)

export const loadRpcPlugin = async (method: string) => {
  if (process.env.DISABLE_PLUGINS) {
    return undefined
  }
  if (rpcPluginHandlers[method]) return rpcPluginHandlers[method]

  const plugin = _.snakeCase(method.split('dev_')[1]).replaceAll('_', '-')
  if (!plugin) return undefined

  const location = new URL(`${plugin}/index.js`, import.meta.url)

  const { rpc } = await import(location.pathname)
  if (!rpc) return undefined

  rpcPluginHandlers[method] = rpc
  logger.debug(`Registered plugin ${plugin} RPC`)

  return rpc
}

export const pluginExtendCli = async (y: Argv) => {
  for (const plugin of plugins) {
    const location = new URL(`${plugin}/index.js`, import.meta.url)
    const { cli } = await import(location.pathname)
    if (cli) {
      cli(y)
      logger.debug(`Registered plugin CLI: ${plugin}`)
    }
  }
}
