import { afterAll, describe, expect, it } from 'vitest'
import { decodeKey, decodeKeyValue, toStorageObject } from '@acala-network/chopsticks-core/utils/decoder.js'

import networks from './networks.js'

const SYSTEM_ACCOUNT =
  '0x26aa394eea5630e07c48ae0c9558cef7b99d880ec681799c0cf30e8886371da9de1e86a9a8c739864cf3cc5ec2bea59fd43593c715fdd31c61141abd04a99fd6822c8558854ccde39a5684e7a56da27d'
const TOKENS_ACCOUNTS =
  '0x99971b5749ac43e0235e41b0d37869188ee7418a6531173d60d1f6a82d8f4d51de1e86a9a8c739864cf3cc5ec2bea59fd43593c715fdd31c61141abd04a99fd6822c8558854ccde39a5684e7a56da27d01a12dfa1fa4ab9a0000'
const TIMESTAMPE_NOW = '0xf0c365c3cf59d671eb72da0e7a4113c49f1f0515f462cdcf84e0f1d6045dfcbb'

describe('decoder', async () => {
  describe('with acala', async () => {
    const { chain, teardown } = await networks.acala()

    afterAll(async () => {
      await teardown()
    })

    it('decode keys', async () => {
      expect(decodeKey(await chain.head.meta, SYSTEM_ACCOUNT)).toMatchSnapshot()
    })

    it('decode key-value', async () => {
      const meta = await chain.head.meta
      const data = { data: { free: 10000000000 } }
      const value = meta.registry.createType('AccountInfo', data)
      const decoded = decodeKeyValue(meta, SYSTEM_ACCOUNT, value.toHex())
      expect(decoded).toMatchSnapshot()
      expect(toStorageObject(decoded)).toMatchSnapshot()

      const ormlAccountData = meta.registry.createType('AccountData', data.data)
      const decoded2 = decodeKeyValue(meta, TOKENS_ACCOUNTS, ormlAccountData.toHex())
      expect(decoded2).toMatchSnapshot()
      expect(toStorageObject(decoded2)).toMatchSnapshot()

      const timestampNow = meta.registry.createType('Moment', data.data)
      const decoded3 = decodeKeyValue(meta, TIMESTAMPE_NOW, timestampNow.toHex())
      expect(decoded3).toMatchSnapshot()
      expect(toStorageObject(decoded3)).toMatchSnapshot()
    })

    it('works with well known keys', async () => {
      const meta = await chain.head.meta
      expect(decodeKeyValue(meta, '0x3a636f6465', '0x12345678')).toMatchSnapshot()
      expect(
        decodeKeyValue(
          meta,
          '0x3a72656c61795f64697370617463685f71756575655f72656d61696e696e675f63617061636974790c0d0000',
          '0xaaaa020000001000',
        ),
      ).toMatchSnapshot()
      expect(decodeKeyValue(meta, '0x3a7472616e73616374696f6e5f6c6576656c3a')).toMatchSnapshot()
      expect(decodeKeyValue(meta, '0x3a65787472696e7369635f696e646578', '0x02000000')).toMatchSnapshot()
      expect(
        decodeKeyValue(
          meta,
          '0xf5207f03cfdce586301014700e2c2593fad157e461d71fd4c1f936839a5f1f3e63f5a4efb16ffa83d0070000',
          '0x0100000043000000',
        ),
      ).toMatchSnapshot()
    })
  })

  it('works with multiple chains', async () => {
    const { chain, teardown } = await networks.polkadot()

    const meta = await chain.head.meta
    const data = { data: { free: 10000000000 } }
    const value = meta.registry.createType('AccountInfo', data)
    const decoded = decodeKeyValue(meta, SYSTEM_ACCOUNT, value.toHex())
    expect(decoded).toMatchSnapshot()
    expect(toStorageObject(decoded)).toMatchSnapshot()
    await teardown()
  })
})
