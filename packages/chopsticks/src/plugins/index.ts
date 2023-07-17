import { camelCase } from 'lodash'
import { lstatSync, readdirSync } from 'fs'
import type yargs from 'yargs'

import { Handlers } from '../rpc/shared'
import { defaultLogger } from '../logger'

export const logger = defaultLogger.child({ name: 'plugin' })

export const pluginHandlers: Handlers = {}

const dirs = readdirSync(__dirname).filter((file) => lstatSync(`${__dirname}/${file}`).isDirectory())

for (const dir of dirs) {
  const path = `${__dirname}/${dir}`
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { rpc, name } = require(path)
  if (rpc) {
    const methodName = name || camelCase(dir)
    pluginHandlers[`dev_${methodName}`] = rpc
  }
}

export const pluginExtendCli = (y: yargs.Argv) => {
  for (const dir of dirs) {
    const path = `${__dirname}/${dir}`
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { cli } = require(path)
    if (cli) {
      cli(y)
    }
  }
}
