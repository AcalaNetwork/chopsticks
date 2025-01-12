import { describe, expect, it } from 'vitest'

import { decodeProof } from '@acala-network/chopsticks-core'
import { upgradeRestrictionSignal } from '@acala-network/chopsticks-core/utils/proof.js'
import { TypeRegistry } from '@polkadot/types'
import networks from './networks.js'

describe('override-relay-state-proof', async () => {
  it('build block using relayChainStateOverrides', async () => {
    const { ws, api, teardown } = await networks.acala()
    const registry = new TypeRegistry()
    const paraId = registry.createType('u32', 1000)

    const keyToOverride = upgradeRestrictionSignal(paraId)
    const value = '0x00'
    const relayChainStateOverrides = [[keyToOverride, value]]

    await ws.send('dev_newBlock', [{ relayChainStateOverrides }])
    const block = await api.rpc.chain.getBlock()
    const setValidationData = block.block.extrinsics
      .find(({ method }) => method.method === 'setValidationData')
      ?.method.toJSON().args.data

    const relayParentStorageRoot = setValidationData.validationData.relayParentStorageRoot
    const trieNodes = setValidationData.relayChainState.trieNodes

    const relayChainState = await decodeProof(relayParentStorageRoot, trieNodes)

    expect(relayChainState[keyToOverride]).to.be.eq(value)

    await teardown()
  })

  it('newBlock with relayParentNumber', async () => {
    const { dev, api, teardown } = await networks.acala()

    await dev.newBlock({ relayParentNumber: 14355209 })
    const block = await api.rpc.chain.getBlock()
    const setValidationData = block.block.extrinsics
      .find(({ method }) => method.method === 'setValidationData')
      ?.method.toJSON().args.data

    expect(setValidationData.validationData.relayParentNumber).to.be.eq(14355209)

    await teardown()
  })
})
