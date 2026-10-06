import { TypeRegistry } from '@polkadot/types'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Block } from './block.js'
import { dryRunExtrinsic } from './block-builder.js'
import { StorageLayer } from './storage-layer.js'

// `system.remark(0x01)`, nonce 0, signed by //Alice through VerifyMultiSignature for Paseo People Next (spec 3000000).
const GENERAL =
  '0xd90145000100e20c04de718dceef47d7490ec926db3766e20177b9cac73aa75554ee1103e31b252f1191d9dcd325e87313e639b4d34eb6c0cdf619bd69fd27e498e7ee634c0188dc3417d5058ec4b4503e0c12ea1a0a89be200fe98922423d4334014fa6b0ee000000000000000000000000000000000401'

const registry = new TypeRegistry()

/** A head whose registry decodes like polkadot.js on People Next: a general extrinsic does not decode. */
const head = () => {
  const chainRegistry = {
    createType: (type: string, value: unknown) => {
      if (type === 'GenericExtrinsic') throw new Error('createType(GenericExtrinsic):: decodeU8aStruct: failed')
      return registry.createType(type, value)
    },
  }
  return {
    number: 1,
    hash: `0x${'11'.repeat(32)}`,
    chain: {},
    storage: new StorageLayer(),
    header: Promise.resolve(registry.createType('Header', { number: 1 })),
    meta: Promise.resolve({ registry }),
    registry: Promise.resolve(chainRegistry),
  } as unknown as Block
}

describe('dryRunExtrinsic', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('applies a general extrinsic without decoding it', async () => {
    const call = vi
      .spyOn(Block.prototype, 'call')
      .mockResolvedValue({ result: '0x0000', storageDiff: [], offchainStorageDiff: [], runtimeLogs: [] })
    const params = { transactions: [], downwardMessages: [], upwardMessages: {}, horizontalMessages: {} }
    expect((await dryRunExtrinsic(head(), [], GENERAL, params)).result).toBe('0x0000')
    expect(call).toHaveBeenLastCalledWith('BlockBuilder_apply_extrinsic', [GENERAL])
  })
})
