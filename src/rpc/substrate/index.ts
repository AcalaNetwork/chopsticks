import author from './author'
import chain from './chain'
import state from './state'
import system from './system'

import { Handlers } from '../shared'

const handlers: Handlers = {
  ...author,
  ...chain,
  ...state,
  ...system,
  rpc_methods: async () => ({
    version: 1,
    methods: Object.keys(handlers),
  }),
}

export default handlers
