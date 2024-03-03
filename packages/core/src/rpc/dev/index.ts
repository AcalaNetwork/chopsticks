import { dev_newBlock } from './new-block.js'
import { dev_setBlockBuildMode } from './set-block-build-mode.js'
import { dev_setHead } from './set-head.js'
import { dev_setRuntimeLogLevel } from './set-runtime-log-level.js'
import { dev_setStorage } from './set-storage.js'
import { dev_timeTravel } from './time-travel.js'

const handlers = {
  dev_newBlock,
  dev_setBlockBuildMode,
  dev_setHead,
  dev_setRuntimeLogLevel,
  dev_setStorage,
  dev_timeTravel,
}

export default handlers

export * from './new-block.js'
export * from './set-block-build-mode.js'
export * from './set-head.js'
export * from './set-runtime-log-level.js'
export * from './set-storage.js'
export * from './time-travel.js'
