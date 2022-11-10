import { Metadata } from '@polkadot/types/metadata'
import { TypeRegistry } from '@polkadot/types'
import { compactStripLength, hexToU8a, u8aToHex } from '@polkadot/util'
import { decorateStorage } from '@polkadot/types/metadata/decorate'
import { describe, expect, it } from 'vitest'
import { get_metadata, get_runtime_version } from '../executor/pkg/executor'
import { readFileSync } from 'fs'
import path from 'path'

describe('wasm', () => {
  it('get metadata from wasm', async () => {
    const wasm = String(readFileSync(path.join(__dirname, 'metadata.example'))).trim()
    expect(wasm.length).toBeGreaterThan(2)
    const metadataStr = u8aToHex(compactStripLength(hexToU8a(await get_metadata(wasm)))[1])
    const registry = new TypeRegistry()
    const metadata = new Metadata(registry, metadataStr)
    registry.setMetadata(metadata)
    expect(registry.metadata.pallets.length).toBeGreaterThan(0)
    const storage = decorateStorage(registry, metadata.asLatest, metadata.version)
    expect(storage.system).toBeTruthy
  })

  it('get runtime version from wasm', async () => {
    const wasm = String(readFileSync(path.join(__dirname, 'metadata.example'))).trim()
    expect(wasm.length).toBeGreaterThan(2)
    const metadata = u8aToHex(compactStripLength(hexToU8a(await get_metadata(wasm)))[1])
    const registry = new TypeRegistry()
    registry.setMetadata(new Metadata(registry, metadata))

    const expectedRuntimeVersion = {
      specName: 'acala',
      implName: 'acala',
      authoringVersion: 1,
      specVersion: 2000,
      implVersion: 0,
      apis: [
        ['0xdf6acb689907609b', 3],
        ['0x37e397fc7c91f5e4', 1],
        ['0x40fe3ad401f8959a', 5],
        ['0xd2bc9897eed08f15', 3],
        ['0xf78b278be53f454c', 2],
        ['0xdd718d5cc53262d4', 1],
        ['0xab3c0572291feb8b', 1],
        ['0xbc9d89904f5b923f', 1],
        ['0x37c8bb1350a9a2a8', 1],
        ['0x6ef953004ba30e59', 1],
        ['0xf485c9145d3f0aad', 1],
        ['0xe3df3f2aa8a5cc57', 1],
        ['0xea93e3f16f3d6962', 1],
      ],
      transactionVersion: 1,
      stateVersion: 0,
    }

    expect(registry.createType('RuntimeVersion', await get_runtime_version(wasm)).toJSON()).toMatchObject(
      expectedRuntimeVersion
    )
  })
})
