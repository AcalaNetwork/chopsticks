import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { SqliteDatabase } from '@acala-network/chopsticks-db'
import { ApiPromise } from '@polkadot/api'
import { WsProvider } from '@polkadot/rpc-provider'
import type { ProviderInterface } from '@polkadot/rpc-provider/types'
import { xxhashAsHex } from '@polkadot/util-crypto'
import type { HexString } from '@polkadot/util/types'
import { Like } from 'typeorm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { type FetchStorageConfig, fetchStorages, getPrefixesFromConfig } from './fetch-storages.js'

describe('fetch-storages', () => {
  let api: ApiPromise
  let provider: ProviderInterface
  const endpoint = 'wss://acala-rpc.aca-api.network'

  beforeAll(async () => {
    provider = new WsProvider(endpoint, 30_000)
    api = new ApiPromise({ provider, noInitWarn: true })
    await api.isReady
  })

  afterAll(async () => {
    await api.disconnect()
  })

  it('get prefixes from config works', async () => {
    const config: FetchStorageConfig = [
      '0x123456',
      'Balances',
      'Tokens.Accounts',
      {
        System: 'Account',
      },
      {
        Tokens: {
          Accounts: ['5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY'],
        },
      },
      {
        Tokens: {
          Accounts: [
            '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
            {
              token: 'DOT',
            },
          ],
        },
      },
      {
        'Tokens.Accounts': ['5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY'],
      },
      {
        'Tokens.Accounts': [
          '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
          {
            token: 'DOT',
          },
        ],
      },
    ]

    const prefixes = await getPrefixesFromConfig(config, api)

    expect(prefixes).toEqual([
      '0x123456',
      '0xc2261276cc9d1f8598ea4b6a74b15c2f',
      '0x99971b5749ac43e0235e41b0d37869188ee7418a6531173d60d1f6a82d8f4d51',
      '0x26aa394eea5630e07c48ae0c9558cef7b99d880ec681799c0cf30e8886371da9',
      '0x99971b5749ac43e0235e41b0d37869188ee7418a6531173d60d1f6a82d8f4d51de1e86a9a8c739864cf3cc5ec2bea59fd43593c715fdd31c61141abd04a99fd6822c8558854ccde39a5684e7a56da27d',
      '0x99971b5749ac43e0235e41b0d37869188ee7418a6531173d60d1f6a82d8f4d51de1e86a9a8c739864cf3cc5ec2bea59fd43593c715fdd31c61141abd04a99fd6822c8558854ccde39a5684e7a56da27dc483de2de1246ea70002',
      '0x99971b5749ac43e0235e41b0d37869188ee7418a6531173d60d1f6a82d8f4d51de1e86a9a8c739864cf3cc5ec2bea59fd43593c715fdd31c61141abd04a99fd6822c8558854ccde39a5684e7a56da27d',
      '0x99971b5749ac43e0235e41b0d37869188ee7418a6531173d60d1f6a82d8f4d51de1e86a9a8c739864cf3cc5ec2bea59fd43593c715fdd31c61141abd04a99fd6822c8558854ccde39a5684e7a56da27dc483de2de1246ea70002',
    ])
  })

  it('get prefixes from config throws', async () => {
    await expect(() => getPrefixesFromConfig(['Balancess'], api)).rejects.toThrow(/Cannot find pallet Balancess/)

    await expect(() => getPrefixesFromConfig(['System.Acount'], api)).rejects.toThrow(
      /Cannot find storage Acount in pallet System/,
    )

    await expect(() =>
      getPrefixesFromConfig(
        [
          {
            System: ['Account', 'BlockHash'],
          },
        ],
        api,
      ),
    ).rejects.toThrow(/Unsupported fetch-storage config: System.Account,BlockHash/)
  })

  it('fetch prefixes works', async () => {
    const blockHash = '0x3a9a2d71537ceedff1a3895d68456f4a870bb89ab649fd47c6cf9c4f9731d580' // 4,500,000
    const dbPath = resolve(tmpdir(), 'fetch.db.sqlite')

    await fetchStorages({
      block: blockHash,
      endpoint,
      dbPath,
      config: [
        'System.Number',
        'Tips',
        {
          Rewards: {
            PoolInfos: [{ Loans: { Token: 'ACA' } }],
          },
        },
      ],
    })

    const db = new SqliteDatabase(dbPath)

    const systemNumberStorage = await db.queryStorage(
      blockHash,
      (xxhashAsHex('System', 128) + xxhashAsHex('Number', 128).slice(2)) as HexString,
    )
    expect(systemNumberStorage?.value).toEqual('0x20aa4400')

    const datasource = await db.datasource
    const keyValueTable = datasource.getRepository('KeyValuePair')

    expect(await keyValueTable.count()).toEqual(5)

    expect(await keyValueTable.countBy({ key: Like(`${xxhashAsHex('Tips', 128)}%`) })).toEqual(3)

    const rewards = await keyValueTable.findBy({ key: Like(`${xxhashAsHex('Rewards', 128)}%`) })
    expect(rewards.length).toEqual(1)
    expect(rewards[0].value).toEqual(
      '0xf45ce8eb6fcaa12109000000000000000800002333cc48e197963c000000000000000014e1339c9e79e7380000000000000000010000000195319d9b71330d010000000000000000bb59ad064bb0bd000000000000000000',
    )

    db.close()
  })
})
