import { describe, expect, it } from 'vitest'

import { env, setupApi, ws } from './helper.js'

// Hydration is an EVM-compatible chain with Frontier runtime APIs
const hydration = {
  endpoint: 'wss://hydration-rpc.n.dwellir.com',
  blockHash: '0x' + '00'.repeat(32), // will use latest if not found
}

// Use a known Hydration block if available, otherwise skip gracefully
describe.skip('eth_* RPC methods', () => {
  setupApi({
    endpoint: hydration.endpoint,
  })

  it('eth_chainId returns Hydration chain id', async () => {
    const result = await ws.send('eth_chainId', [])
    // Hydration chain id is 222222 = 0x3640e
    expect(result).toBe('0x3640e')
  })

  it('eth_blockNumber returns a hex number', async () => {
    const result = await ws.send('eth_blockNumber', [])
    expect(result).toMatch(/^0x[0-9a-f]+$/)
  })

  it('eth_getBalance returns balance for address', async () => {
    const result = await ws.send('eth_getBalance', ['0x0000000000000000000000000000000000000000', 'latest'])
    expect(result).toMatch(/^0x[0-9a-f]+$/)
  })

  it('eth_getTransactionCount returns nonce', async () => {
    const result = await ws.send('eth_getTransactionCount', ['0x0000000000000000000000000000000000000000', 'latest'])
    expect(result).toMatch(/^0x[0-9a-f]+$/)
  })

  it('eth_getCode returns code for address', async () => {
    const result = await ws.send('eth_getCode', ['0x0000000000000000000000000000000000000000', 'latest'])
    expect(typeof result).toBe('string')
    expect(result.startsWith('0x')).toBe(true)
  })

  it('eth_gasPrice returns gas price', async () => {
    const result = await ws.send('eth_gasPrice', [])
    expect(result).toMatch(/^0x[0-9a-f]+$/)
  })

  it('net_version returns chain id as decimal string', async () => {
    const result = await ws.send('net_version', [])
    expect(result).toBe('222222')
  })

  it('web3_clientVersion returns chopsticks version', async () => {
    const result = await ws.send('web3_clientVersion', [])
    expect(result).toContain('chopsticks')
  })

  it('eth_accounts returns empty array', async () => {
    const result = await ws.send('eth_accounts', [])
    expect(result).toEqual([])
  })

  it('eth_syncing returns false', async () => {
    const result = await ws.send('eth_syncing', [])
    expect(result).toBe(false)
  })
})
