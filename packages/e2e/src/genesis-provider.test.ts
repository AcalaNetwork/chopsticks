import { afterAll, describe, expect, it } from 'vitest'

import { BuildBlockMode } from '@acala-network/chopsticks'
import { check, testingPairs } from './helper.js'
import { setupContextWithConfig } from '@acala-network/chopsticks-testing'

describe.each([
  [
    'Mandala',
    'https://raw.githubusercontent.com/AcalaNetwork/Acala/2c43dbbb380136f2c35bd0db08b286f346b71d61/resources/mandala-dist.json',
  ],
  ['Kusama', new URL('../blobs/kusama.json', import.meta.url).pathname],
  ['Asset Hub Kusama', new URL('../blobs/asset-hub-kusama.json', import.meta.url).pathname],
])(`genesis provider works %s`, async (name, genesis) => {
  const { chain, dev, api, teardown } = await setupContextWithConfig({
    port: 0,
    genesis,
    'build-block-mode': BuildBlockMode.Manual,
  })

  afterAll(teardown)

  describe('genesis provider works', () => {
    it.runIf(name === 'Kusama')('get next key', async () => {
      const nextKeys = await api.rpc.state.getKeysPaged(
        '0x26aa394eea5630e07c48ae0c9558cef7b99d880ec681799c0cf30e8886371da9',
        100,
        '0x26aa394eea5630e07c48ae0c9558cef7b99d880ec681799c0cf30e8886371da923a05cabf6d3bde7ca3ef0d11596b5611cbd2d43530a44705ad088af313e18f80b53ef16b36177cd4b77b846f2a5f07c',
      )
      expect(nextKeys.toJSON()).toMatchInlineSnapshot(`
        [
          "0x26aa394eea5630e07c48ae0c9558cef7b99d880ec681799c0cf30e8886371da932a5935f6edc617ae178fef9eb1e211fbe5ddb1579b72e84524fc29e78609e3caf42e85aa118ebfe0b0ad404b5bdd25f",
          "0x26aa394eea5630e07c48ae0c9558cef7b99d880ec681799c0cf30e8886371da94f9aea1afa791265fae359272badc1cf8eaf04151687736326c9fea17e25fc5287613693c912909cb226aa4794f26a48",
          "0x26aa394eea5630e07c48ae0c9558cef7b99d880ec681799c0cf30e8886371da95ecffd7b6c0f78751baa9d281e0bfa3a6d6f646c70792f74727372790000000000000000000000000000000000000000",
          "0x26aa394eea5630e07c48ae0c9558cef7b99d880ec681799c0cf30e8886371da96f2e33376834a63c86a195bcf685aebbfe65717dad0447d715f660a0a58411de509b42e6efb8375f562f58a554d5860e",
          "0x26aa394eea5630e07c48ae0c9558cef7b99d880ec681799c0cf30e8886371da98578796c363c105114787203e4d93ca6101191192fc877c24d725b337120fa3edc63d227bbc92705db1e2cb65f56981a",
          "0x26aa394eea5630e07c48ae0c9558cef7b99d880ec681799c0cf30e8886371da9b0edae20838083f2cde1c4080db8cf8090b5ab205c6974c9ea841be688864633dc9ca8a357843eeacf2314649965fe22",
          "0x26aa394eea5630e07c48ae0c9558cef7b99d880ec681799c0cf30e8886371da9b321d16960ce1d9190b61e2421cc60131e07379407fecc4b89eb7dbd287c2c781cfb1907a96947a3eb18e4f8e7198625",
          "0x26aa394eea5630e07c48ae0c9558cef7b99d880ec681799c0cf30e8886371da9de1e86a9a8c739864cf3cc5ec2bea59fd43593c715fdd31c61141abd04a99fd6822c8558854ccde39a5684e7a56da27d",
          "0x26aa394eea5630e07c48ae0c9558cef7b99d880ec681799c0cf30e8886371da9e5e802737cce3a54b0bc9e3d3e6be26e306721211d5404bd9da88e0204360a1a9ab8b87c66c1bc2fcdd37f3c2222cc20",
          "0x26aa394eea5630e07c48ae0c9558cef7b99d880ec681799c0cf30e8886371da9edeaa42c2163f68084a988529a0e2ec5e659a7a1628cdd93febc04a4e0646ea20e9f5f0ce097d9a05290d4a9e054df4e",
          "0x26aa394eea5630e07c48ae0c9558cef7b99d880ec681799c0cf30e8886371da9f3f619a1c2956443880db9cc9a13d058e860f1b1c7227f7c22602f53f15af80747814dffd839719731ee3bba6edc126c",
        ]
      `)
    })

    it('build blocks', async () => {
      expect(await dev.newBlock()).toBeTruthy()
      const block = await chain.getBlockAt(1)
      expect(block).toBeTruthy
      expect(block?.number).toBe(1)
      await check(api.rpc.system.name()).toMatchSnapshot()
    })

    it.skipIf(name === 'Asset Hub Kusama')('handles tx', async () => {
      await dev.newBlock()

      const { alice, bob } = testingPairs()

      await dev.setStorage({
        System: {
          Account: [[[alice.address], { providers: 1, data: { free: 1000 * 1e12 } }]],
        },
      })

      await check(api.query.system.account(alice.address)).toMatchSnapshot()

      await api.tx.balances.transfer(bob.address, 123 * 1e12).signAndSend(alice)

      await dev.newBlock()

      await check(api.query.system.account(alice.address)).toMatchSnapshot()
      await check(api.query.system.account(bob.address)).toMatchSnapshot()
    })
  })
})
