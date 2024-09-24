import { afterAll, describe, expect, it } from 'vitest'

import { TypeRegistry } from '@polkadot/types'
import { decodeProof } from '@acala-network/chopsticks-core'
import { setupAll } from './helper.js'
import { upgradeRestrictionSignal } from '@acala-network/chopsticks-core/utils/proof.js'

describe.runIf(process.env.CI || process.env.RUN_ALL).each([
  { chain: 'Statemint', endpoint: 'wss://statemint-rpc.dwellir.com' },
  { chain: 'Polkadot Collectives', endpoint: 'wss://sys.ibp.network/collectives-polkadot' },
  { chain: 'Acala', endpoint: 'wss://acala-rpc.aca-api.network' },
  { chain: 'Statemine', endpoint: 'wss://statemine-rpc-tn.dwellir.com' },
  {
    chain: 'Karura',
    endpoint: 'wss://karura-rpc.aca-api.network',
  },
  { chain: 'Westmint', endpoint: 'wss://westmint-rpc.polkadot.io' },
  { chain: 'Westend Collectives', endpoint: 'wss://sys.ibp.network/collectives-westend' },
])('Latest $chain can build blocks', async ({ endpoint }) => {
  const { setupPjs, teardownAll } = await setupAll({ endpoint })

  afterAll(async () => {
    await teardownAll()
  })

  it('build block using relayChainStateOverrides', async () => {
    const { ws, api, teardown } = await setupPjs()
    const registry = new TypeRegistry()
    const paraId = registry.createType('u32', 1000)

    const keyToOverride = upgradeRestrictionSignal(paraId)
    const value = '0x00'
    const relayChainStateOverrides = [[keyToOverride, value]]

    await ws.send('dev_newBlock', [{ relayChainStateOverrides }])
    const block = await api.rpc.chain.getBlock()
    const setValidationData = block.block.extrinsics
      .find(({ method }) => method.method == 'setValidationData')
      ?.method.toJSON().args.data

    const relayParentStorageRoot = setValidationData.validationData.relayParentStorageRoot
    const trieNodes = setValidationData.relayChainState.trieNodes

    const relayChainState = await decodeProof(relayParentStorageRoot, trieNodes)

    expect(relayChainState[keyToOverride]).to.be.eq(value)

    await teardown()
  })
})
