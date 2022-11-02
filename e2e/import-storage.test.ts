import path from 'path'
import { describe, expect, it } from 'vitest'
import { importStorage } from '../src/utils/import-storage'

import { chain, env, setupApi } from './helper'

setupApi(env.mandala)

const sudoKey = '0x5c0d1176a568c1f92944340dbfed9e9c530ebca703c85910e7164cb7d1c9e47b'

describe('import-storage', () => {
  it('importStorage', async () => {
    const block = (await chain.getBlock())!

    expect(await block.get(sudoKey)).toBe('0x8815a8024b06a5b4c8703418f52125c923f939a5c40a717f6ae3011ba7719019')

    await importStorage(path.join(__dirname, './storage.yml'), chain)

    expect(await block.get(sudoKey)).toBeUndefined
  })
})
