import { describe, expect, it } from 'vitest'
import path from 'path'

import { chain, setupApi } from '../helper'
import { importStorage, overrideWasm } from '../../src/utils/import-storage'

setupApi({
  endpoint: 'wss://acala-rpc-1.aca-api.network',
  blockHash: '0x663c25dc86521f4b7f74dcbc26224bb0fac40e316e6b0bcf6a51de373f37afac', // 2_000_000
})

const sudoKey = '0x5c0d1176a568c1f92944340dbfed9e9c530ebca703c85910e7164cb7d1c9e47b'

describe('import-storage', () => {
  it('works', async () => {
    const block = await chain.getBlock()

    expect(await block?.get(sudoKey)).toBe('0x6d6f646c6163612f747273790000000000000000000000000000000000000000')

    await importStorage(chain, path.join(__dirname, './storage.ok.yml'))

    expect(await block?.get(sudoKey)).toBeUndefined
  })

  it('handle errors', async () => {
    const notExist = path.join(__dirname, 'does_not_exist.yml')
    await expect(importStorage(chain, notExist)).rejects.toThrowError(`File ${notExist} does not exist`)
    await expect(importStorage(chain, path.join(__dirname, 'storage.error.pallet.yml'))).rejects.toThrowError(
      'Cannot find pallet TTechnicalCommittee'
    )
    await expect(importStorage(chain, path.join(__dirname, 'storage.error.storage.yml'))).rejects.toThrowError(
      'Cannot find storage MMembers in pallet TechnicalCommittee'
    )
  })

  it('wasm override works', async () => {
    expect(await chain.head.runtimeVersion).toContain({ specVersion: 2096 })
    const oldWasm = await chain.head.wasm
    await overrideWasm(chain, path.join(__dirname, '../blobs/acala-runtime-2101.txt'))
    expect(await chain.head.wasm).not.eq(oldWasm)
    expect(await chain.head.runtimeVersion).toContain({ specVersion: 2101 })
    const blockNumber = chain.head.number
    // can produce blocks
    await expect(chain.newBlock()).resolves.toContain({ number: blockNumber + 1 })
  })
})
