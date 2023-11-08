import { Handlers } from '@acala-network/chopsticks-core'
import { lstatSync, readdirSync } from 'fs'
import _ from 'lodash'
import type { Argv } from 'yargs'

import { defaultLogger } from '../logger.js'

const logger = defaultLogger.child({ name: 'plugin' })

export const pluginHandlers: Handlers = {}

// list of plugins directory
const plugins = readdirSync(new URL('.', import.meta.url)).filter((file) =>
  lstatSync(new URL(file, import.meta.url)).isDirectory(),
)

export const loadRpcPlugin = async (method: string) => {
  if (!process.env.DISABLE_PLUGINS) {
    return undefined
  }
  if (pluginHandlers[method]) return pluginHandlers[method]

  const plugin = _.snakeCase(method.split('dev_')[1]).replaceAll('_', '-')
  if (!plugin) return undefined

  const location = new URL(`${plugin}/index.js`, import.meta.url)

  const { rpc } = await import(location.pathname)
  if (!rpc) return undefined

  pluginHandlers[method] = rpc
  logger.debug(`Registered plugin ${plugin} RPC`)

  return rpc
}

export const pluginExtendCli = async (argv: Argv) => {
  const args = await argv.parse()
  const commands = args._
  if (!commands?.length) return

  const plugin = commands.find((arg) => plugins.includes(arg as string))
  if (!plugin) return

  const location = new URL(`${plugin}/index.js`, import.meta.url)

  const { cli } = await import(location.pathname)
  if (cli) {
    cli(argv)
    logger.debug(`Registered plugin ${plugin} CLI`)
  }
}
