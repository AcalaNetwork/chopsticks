import { Handlers } from '@acala-network/chopsticks-core'
import _ from 'lodash'
import type { Argv } from 'yargs'

import * as decodeKeyPlugin from './decode-key'
import * as dryRunPlugin from './dry-run'
import * as followChainPlugin from './follow-chain'
import * as newBlockPlugin from './new-block'
import * as runBlockPlugin from './run-block'
import * as setBlockBuildModePlugin from './set-block-build-mode'
import * as setHeadPlugin from './set-head'
import * as setRuntimeLogLevelPlugin from './set-runtime-log-level'
import * as setStoragePlugin from './set-storage'
import * as timeTravelPlugin from './time-travel'
import * as tryRuntimePlugin from './try-runtime'
import { defaultLogger } from '../logger'

const logger = defaultLogger.child({ name: 'plugin' })

const plugins = [
  { module: decodeKeyPlugin, name: 'decode-key' },
  { module: dryRunPlugin, name: 'dry-run' },
  { module: followChainPlugin, name: 'follow-chain' },
  { module: newBlockPlugin, name: 'new-block' },
  { module: runBlockPlugin, name: 'run-block' },
  { module: setBlockBuildModePlugin, name: 'set-block-build-mode' },
  { module: setHeadPlugin, name: 'set-head' },
  { module: setRuntimeLogLevelPlugin, name: 'set-runtime-log-level' },
  { module: setStoragePlugin, name: 'set-storage' },
  { module: timeTravelPlugin, name: 'time-travel' },
  { module: tryRuntimePlugin, name: 'try-runtime' },
]

export const pluginHandlers: Handlers = {}

for (const plugin of plugins) {
  const { module, name } = plugin
  if (module.rpc) {
    const methodName = module.name || _.camelCase(name)
    pluginHandlers[`dev_${methodName}`] = module.rpc
    logger.debug(`Registered plugin ${name} RPC`)
  }
}

export const pluginExtendCli = async (y: Argv) => {
  for (const plugin of plugins) {
    const { module, name } = plugin
    if (module.cli) {
      module.cli(y)
      logger.debug(`Registered plugin ${name} CLI`)
    }
  }
}
