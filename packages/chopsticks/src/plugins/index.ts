import { lstatSync, readFileSync, readdirSync } from 'node:fs'
import { type Handlers, environment } from '@acala-network/chopsticks-core'
import _ from 'lodash'
import type { Argv } from 'yargs'

import { resolve } from 'node:path'
import { defaultLogger } from '../logger.js'

const logger = defaultLogger.child({ name: 'plugin' })

export const rpcPluginHandlers: Handlers = {}

// list of plugins directory
const plugins = readdirSync(new URL('.', import.meta.url)).filter((file) =>
  lstatSync(new URL(file, import.meta.url)).isDirectory(),
)

// find all rpc methods
export const rpcPluginMethods = plugins
  .filter((name) => readdirSync(new URL(name, import.meta.url)).some((file) => file.startsWith('rpc')))
  .map((name) => `dev_${_.camelCase(name)}`)

const loadRpcPlugin = async (method: string) => {
  if (environment.DISABLE_PLUGINS) {
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

// store the loaded methods by cli
let rpcScriptMethods: Handlers = {}

// use cli to load rpc methods of external scripts
export const loadRpcMethodsByScripts = async (path: string) => {
  try {
    const scriptContent = readFileSync(resolve(path), 'utf8')
    rpcScriptMethods = new Function(scriptContent)()
    logger.info(`${Object.keys(rpcScriptMethods).length} extension rpc methods loaded from ${path}`)
  } catch (error) {
    console.log('Failed to load rpc extension methods', error)
  }
}

export const getRpcExtensionMethods = () => {
  return [...Object.keys(rpcScriptMethods), ...rpcPluginMethods]
}

export const loadRpcExtensionMethod = async (method: string) => {
  if (rpcScriptMethods[method]) return rpcScriptMethods[method]
  return loadRpcPlugin(method)
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
