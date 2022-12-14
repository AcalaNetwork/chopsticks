import { Handlers } from '../shared'

const handlers: Handlers = {
  system_chain: async (context) => {
    return context.chain.api.getSystemChain()
  },
  system_properties: async (context) => {
    return context.chain.api.getSystemProperties()
  },
  system_name: async (context) => {
    return context.chain.api.getSystemName()
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
  system_dryRun: async (context, [extrinsic, at]) => {
    const { outcome } = await context.chain.dryRunExtrinsic(extrinsic, at)
    return outcome.toHex()
  },
}

export default handlers
