import { WsProvider } from '@polkadot/rpc-provider'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { ApiPromise } from '@polkadot/api'
import { FetchStorageConfig, getPrefixesFromConfig } from './fetch-storages.js'

describe('fetch-storage', () => {
  let api: ApiPromise

  beforeAll(async () => {
    api = new ApiPromise({ provider: new WsProvider('wss://acala-rpc.aca-api.network', 60_000) })
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
    expect(() => getPrefixesFromConfig(['Balancess'], api)).rejects.toThrow(/Cannot find pallet Balancess/)

    expect(() => getPrefixesFromConfig(['System.Acount'], api)).rejects.toThrow(
      /Cannot find storage Acount in pallet System/,
    )

    expect(() =>
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

  it('fetch prefixes works')
})
