import { camelCase } from 'lodash'
import { lstatSync, readdirSync } from 'fs'
import type yargs from 'yargs'

import { Handlers } from '../rpc/shared'
import { defaultLogger } from '../logger'

const logger = defaultLogger.child({ name: 'plugin' })

export const pluginHandlers: Handlers = {}

const plugins = readdirSync(__dirname).filter((file) => lstatSync(`${__dirname}/${file}`).isDirectory())

;(async () => {
  for (const plugin of plugins) {
    const { rpc, name } = await import(`./${plugin}`)
    if (rpc) {
      const methodName = name || camelCase(plugin)
      pluginHandlers[`dev_${methodName}`] = rpc
      logger.debug(`Registered plugin ${plugin} RPC`)
    }
  }
})()

export const pluginExtendCli = async (y: yargs.Argv) => {
  for (const plugin of plugins) {
    const { cli } = await import(`./${plugin}`)
    if (cli) {
      cli(y)
      logger.debug(`Registered plugin ${plugin} CLI`)
    }
  }
}
