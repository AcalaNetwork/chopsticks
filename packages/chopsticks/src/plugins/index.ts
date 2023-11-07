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

export const loadRPCPlugins = async () => {
  for (const plugin of plugins) {
    const location = new URL(`${plugin}/index.js`, import.meta.url)
    const { rpc, name } = await import(location.pathname)
    if (rpc) {
      const methodName = name || _.camelCase(plugin)
      pluginHandlers[`dev_${methodName}`] = rpc
      logger.debug(`Registered plugin RPC: ${`dev_${methodName}`}`)
    }
  }
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
