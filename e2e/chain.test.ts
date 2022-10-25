import { describe, expect, it } from 'vitest'

import { api } from './helper'

describe('chain rpc', () => {
  it('getter works', async () => {
    const hashHead = '0x68cff8682eda3e5e63b375253bdb3a01f0dce1879fe7ade97c9697406c56b55a'
    const hash0 = '0x23fc729c2cdb7bd6770a4e8c58748387cc715fcf338f1f74a16833d90383f4b0'
    const hash1000 = '0x7fbf942ac7a197ed6c9ecb7733bb1d42347b7b88c32973857cc13bd98febbbab'

    expect((await api.rpc.chain.getBlockHash()).toHex()).toMatch(hashHead)
    expect((await api.rpc.chain.getBlockHash(0)).toHex()).toMatch(hash0)
    expect((await api.rpc.chain.getBlockHash(1000)).toHex()).toMatch(hash1000)

    expect((await api.rpc.chain.getHeader()).toJSON()).toMatchSnapshot()
    expect((await api.rpc.chain.getHeader(hashHead)).toJSON()).toMatchSnapshot()
    expect((await api.rpc.chain.getHeader(hash0)).toJSON()).toMatchSnapshot()
    expect((await api.rpc.chain.getHeader(hash1000)).toJSON()).toMatchSnapshot()

    expect((await api.rpc.chain.getBlock()).toJSON()).toMatchSnapshot()
    expect((await api.rpc.chain.getBlock(hashHead)).toJSON()).toMatchSnapshot()
    expect((await api.rpc.chain.getBlock(hash0)).toJSON()).toMatchSnapshot()
    expect((await api.rpc.chain.getBlock(hash1000)).toJSON()).toMatchSnapshot()

    expect((await api.rpc.chain.getFinalizedHead()).toHex()).toMatch(hashHead)
  })
})
