import { Handlers } from '../shared'

const handlers: Handlers = {
  system_chain: async (context) => {
    return context.api.rpc.system.chain()
  },
  system_properties: async (context) => {
    return context.api.rpc.system.properties()
  },
  system_name: async (context) => {
    return context.api.rpc.system.name()
  },
  system_version: async (context) => {
    return context.api.rpc.system.version()
  },
}

export default handlers
