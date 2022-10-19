import { Handlers } from '../shared'

const handlers: Handlers = {
  system_chain: async (context) => {
    return context.api.rpc.system.chain()
  },
  system_properties: async (context) => {
    return context.api.rpc.system.properties()
  },
}

export default handlers
