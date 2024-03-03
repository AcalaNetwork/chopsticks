import * as DevNewBlock from './new-block.js'
import * as DevSetBlockBuildMode from './set-block-build-mode.js'
import * as DevSetHead from './set-head.js'
import * as DevSetRuntimeLogLevel from './set-runtime-log-level.js'
import * as DevSetStorage from './set-storage.js'
import * as DevTimeTravel from './time-travel.js'

export { DevNewBlock, DevSetBlockBuildMode, DevSetHead, DevSetRuntimeLogLevel, DevSetStorage, DevTimeTravel }

const handlers = {
  ...DevNewBlock,
  ...DevSetBlockBuildMode,
  ...DevSetHead,
  ...DevSetRuntimeLogLevel,
  ...DevSetStorage,
  ...DevTimeTravel,
}

export default handlers

export type { NewBlockParams } from './new-block.js'
