import { readFileSync } from 'node:fs'
import path from 'node:path'
import { upgradeRestrictionSignal } from '@acala-network/chopsticks-core/utils/proof.js'
import { TypeRegistry } from '@polkadot/types'
import { blake2AsHex } from '@polkadot/util-crypto'
import { afterAll, describe, expect, it } from 'vitest'

import { testingPairs } from './helper.js'
import networks from './networks.js'

describe('upgrade with setValidationData format change', { timeout: 300_000 }, async () => {
  const { alith } = testingPairs()

  // Fork moonbase alpha, which currently uses the old 1-arg setValidationData format.
  // The new runtime uses the 2-arg format introduced in polkadot-stable2512.
  const { api, dev, chain, teardown } = await networks.moonbase()

  afterAll(async () => {
    await teardown()
  })

  it('can build blocks after upgrading to a runtime with 2-arg setValidationData', async () => {
    const runtime = readFileSync(path.join(__dirname, '../blobs/moonbase-runtime-4300.txt')).toString().trim()
    const rtHash = blake2AsHex(runtime)

    // Verify we're starting with the old runtime
    const specBefore = (await chain.head.runtimeVersion).specVersion
    expect(specBefore).toBeLessThan(4300)

    // Authorize the upgrade and ensure Alith has enough funds for the large extrinsic
    await dev.setStorage({
      System: {
        AuthorizedUpgrade: `${rtHash}01`, // 01 = check spec version
        Account: [
          [
            [alith.address],
            { providers: 1, data: { free: '0x021E19E0C9BAB2400000' } }, // 10_000_000 DEV
          ],
        ],
      },
    })
    await dev.newBlock()

    await api.tx.system.applyAuthorizedUpgrade(runtime).signAndSend(alith)

    const registry = new TypeRegistry()
    const paraId = registry.createType('u32', await api.query.parachainInfo.parachainId())
    await dev.newBlock({
      count: 3,
      relayChainStateOverrides: [[upgradeRestrictionSignal(paraId), null]],
    })

    // Verify the upgrade succeeded
    const specAfter = (await chain.head.runtimeVersion).specVersion
    expect(specAfter).toBe(4300)

    // This is the critical test: build blocks AFTER the upgrade.
    // Previously this failed because:
    // 1. The upgrade block's setValidationData was encoded with the old 1-arg format
    // 2. But the block's metadata (post-upgrade) defines the new 2-arg format
    // 3. Chopsticks couldn't decode the parent block's validation data
    // 4. The grandparent fallback had an incorrect relay slot calculation (off-by-1)
    const heightBefore = (await api.rpc.chain.getHeader()).number.toNumber()
    await dev.newBlock({ count: 2 })
    const heightAfter = (await api.rpc.chain.getHeader()).number.toNumber()
    expect(heightAfter - heightBefore).toBe(2)
  })
})
