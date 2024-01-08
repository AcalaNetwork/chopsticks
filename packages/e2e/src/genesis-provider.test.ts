import { describe, expect, it } from 'vitest'

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
  const { chain, dev, api } = await setupContextWithConfig({
    port: 1234,
    genesis,
    'build-block-mode': BuildBlockMode.Manual,
  })

  describe('genesis provider works', () => {
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
