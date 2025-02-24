import { describe, expect, it } from 'vitest'
import { chain, setupApi } from './helper.js'

setupApi({
  endpoint: 'wss://acala-rpc-1.aca-api.network',
  blockHash: '0x663c25dc86521f4b7f74dcbc26224bb0fac40e316e6b0bcf6a51de373f37afac',
})

describe('metadata', () => {
  it('metadata with storage value', async () => {
    const meta = await chain.head.meta
    expect((meta.consts.evmAccounts.chainId as any).toNumber()).eq(787)
  })
})
