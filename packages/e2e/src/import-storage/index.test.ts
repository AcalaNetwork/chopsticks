import { describe, expect, it } from 'vitest'
import path from 'path'

import { api, chain, setupApi } from '../helper.js'
import { compactHex } from '@acala-network/chopsticks'
import { overrideStorage, overrideWasm } from '@acala-network/chopsticks/utils/override.js'

setupApi({
  endpoint: 'wss://acala-rpc.aca-api.network',
  blockHash: '0x663c25dc86521f4b7f74dcbc26224bb0fac40e316e6b0bcf6a51de373f37afac', // 2_000_000
})

const sudoKey = '0x5c0d1176a568c1f92944340dbfed9e9c530ebca703c85910e7164cb7d1c9e47b'

describe('import-storage', () => {
  it('works', async () => {
    const block = await chain.getBlock()
    if (!block) throw new Error('block not found')

    expect(await block.get(sudoKey)).toBe('0x6d6f646c6163612f747273790000000000000000000000000000000000000000')

    await overrideStorage(chain, path.join(__dirname, './storage.ok.yml'))

    expect(await block.get(sudoKey)).toBe('0x') // None

    {
      const key = compactHex((await block.meta).query.stableAsset.pools(0))
      expect(await block.get(key)).toBe('0x') // None
    }

    const key = compactHex((await block.meta).query.timestamp.now())
    expect(await block.get(key)).toBe('0x0100000000000000')
  })

  it('handle errors', async () => {
    const notExist = path.join(__dirname, 'does_not_exist.yml')
    await expect(overrideStorage(chain, notExist)).rejects.toThrowError(`File ${notExist} does not exist`)
    await expect(overrideStorage(chain, path.join(__dirname, 'storage.error.pallet.yml'))).rejects.toThrowError(
      'Cannot find pallet TTechnicalCommittee',
    )
    await expect(overrideStorage(chain, path.join(__dirname, 'storage.error.storage.yml'))).rejects.toThrowError(
      'Cannot find storage MMembers in pallet TechnicalCommittee',
    )
    // fixes api runtime disconnect warning
    await new Promise((r) => setTimeout(r, 50))
  })

  it('wasm override works', async () => {
    expect(await chain.head.runtimeVersion).toEqual(expect.objectContaining({ specVersion: 2096 }))
    const oldWasm = await chain.head.wasm
    await overrideWasm(chain, path.join(__dirname, '../../blobs/acala-runtime-2101.txt'))
    expect(await chain.head.wasm).not.eq(oldWasm)
    expect(await chain.head.runtimeVersion).toEqual(expect.objectContaining({ specVersion: 2101 }))
    const blockNumber = chain.head.number
    // can produce blocks
    await expect(chain.newBlock()).resolves.toEqual(expect.objectContaining({ number: blockNumber + 1 }))
  })

  it('able to reset storage map', async () => {
    await overrideStorage(chain, {
      Tokens: {
        $removePrefix: ['Accounts'],
        Accounts: [
          [
            ['5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY', { Token: 'ACA' }],
            {
              free: 1000000000000000,
            },
          ],
        ],
      },
    })

    const entries = await api.query.tokens.accounts.entries()
    expect(entries).toMatchInlineSnapshot(`
      [
        [
          "0x99971b5749ac43e0235e41b0d37869188ee7418a6531173d60d1f6a82d8f4d51de1e86a9a8c739864cf3cc5ec2bea59fd43593c715fdd31c61141abd04a99fd6822c8558854ccde39a5684e7a56da27d01a12dfa1fa4ab9a0000",
          {
            "free": 1000000000000000,
            "frozen": 0,
            "reserved": 0,
          },
        ],
      ]
    `)
  })
})
