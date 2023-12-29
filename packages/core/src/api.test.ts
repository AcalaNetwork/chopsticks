import { Api } from './api.js'
import { WsProvider } from '@polkadot/rpc-provider'
import { expect, test } from 'vitest'

test('handle invalid block hash', async () => {
  const api = new Api(new WsProvider('wss://acala-rpc.aca-api.network', 3_000))
  await api.isReady

  await expect(api.getHeader('0x')).rejects.toThrow('invalid length')
  expect(await api.getHeader('0xc87ae632b2cc4583a37659785f5098947acfdc6a36dbb07abcfa6ad694f97c5d')).toBeNull()
  expect(await api.getBlock('0xc87ae632b2cc4583a37659785f5098947acfdc6a36dbb07abcfa6ad694f97c5d')).toBeNull()
  expect(await api.getBlockHash(999999999)).toBeNull()
  expect(await api.getBlockHash()).toBeTruthy()
  expect(await api.getStorage('0x0001')).toBeNull()
  await expect(
    api.getKeysPaged('0x', 1, '0x', '0xc87ae632b2cc4583a37659785f5098947acfdc6a36dbb07abcfa6ad694f97c5d'),
  ).rejects.toThrow('Header was not found')

  await api.disconnect()
})
