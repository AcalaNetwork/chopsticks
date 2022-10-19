import chain from './chain'
import state from './state'
import system from './system'

import { Handlers } from '../shared'

const handlers: Handlers = {
  ...chain,
  ...state,
  ...system,
  rpc_methods: async () => Object.keys(handlers),
}

export default handlers
