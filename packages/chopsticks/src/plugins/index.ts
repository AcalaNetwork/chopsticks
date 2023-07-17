import { Handlers } from '../rpc/shared'
import { defaultLogger } from '../logger'

import { dev_dryRun } from './dry-run'
import { dev_newBlock } from './new-block'
import { dev_setBlockBuildMode } from './set-block-build-mode'
import { dev_setHead } from './set-head'
import { dev_setStorage } from './set-storage'
import { dev_timeTravel } from './time-travel'

export const logger = defaultLogger.child({ name: 'plugin' })

export const pluginHandlers: Handlers = {
  dev_dryRun,
  dev_newBlock,
  dev_setStorage,
  dev_setHead,
  dev_setBlockBuildMode,
  dev_timeTravel,
}
