import { Handlers } from '../shared'

const handlers: Handlers = {
  system_chain: async (context) => {
    return context.api.getSystemChain()
  },
  system_properties: async (context) => {
    return context.api.getSystemProperties()
  },
  system_name: async (context) => {
    return context.api.getSystemName()
  },
  system_version: async (_context) => {
    return 'chopsticks-1.1.0'
  },
  system_chainType: async (_context) => {
    return 'Development'
  },
  system_health: async () => {
    return {
      peers: 0,
      isSyncing: false,
      shouldhVePeers: false,
    }
  },
}

export default handlers
