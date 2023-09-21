import { ChainProperties } from '@acala-network/chopsticks-core'
import { HexString } from '@polkadot/util/types'
import { Index } from '@polkadot/types/interfaces'
import { hexToU8a } from '@polkadot/util'
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { Context } from '../shared'

export interface SystemHandlers {
  system_localPeerId: () => Promise<string>
  system_nodeRoles: () => Promise<string[]>
  system_localListenAddresses: () => Promise<string[]>
  system_chain: (context: Context) => Promise<string>
  system_properties: (context: Context) => Promise<ChainProperties>
  system_name: (context: Context) => Promise<string>
  system_version: (context: Context) => Promise<string>
  system_chainType: (context: Context) => Promise<string>
  system_health: (context: Context) => Promise<{ peers: 0; isSyncing: false; shouldHavePeers: false }>
  /**
   * @param {Context} context
   * @param params - [`extrinsic`, `at`]
   */
  system_dryRun: (context: Context, [extrinsic, at]: [HexString, HexString]) => Promise<HexString>
  /**
   * @param {Context} context
   * @param params - [`address`]
   */
  system_accountNextIndex: (context: Context, [address]: [string]) => Promise<number>
}

/**
 * Substrate `system` RPC methods, see {@link SystemHandlers} for methods details.
 */
const handlers: SystemHandlers = {
  system_localPeerId: async () => '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
  system_nodeRoles: async () => ['Full'],
  system_localListenAddresses: async () => [],
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
    const { version } = JSON.parse(readFileSync(path.join(__dirname, '../../../package.json'), 'utf-8'))
    return `chopsticks-v${version}`
  },
  system_chainType: async (_context) => {
    return 'Development'
  },
  system_health: async () => {
    return {
      peers: 0,
      isSyncing: false,
      shouldHavePeers: false,
    }
  },
  system_dryRun: async (context, [extrinsic, at]) => {
    const { outcome } = await context.chain.dryRunExtrinsic(extrinsic, at)
    return outcome.toHex()
  },
  system_accountNextIndex: async (context, [address]) => {
    const head = context.chain.head
    const registry = await head.registry
    const account = registry.createType('AccountId', address)
    const result = await head.call('AccountNonceApi_account_nonce', [account.toHex()])
    const nonce = registry.createType<Index>('Index', hexToU8a(result.result)).toNumber()
    return nonce + context.chain.txPool.pendingExtrinsicsBy(address).length
  },
}

export default handlers
