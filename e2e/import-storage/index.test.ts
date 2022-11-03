import { describe, expect, it } from 'vitest'
import path from 'path'

import { chain, env, setupApi } from '../helper'
import { importStorage } from '../../src/utils/import-storage'

setupApi(env.mandala)

const sudoKey = '0x5c0d1176a568c1f92944340dbfed9e9c530ebca703c85910e7164cb7d1c9e47b'

describe('import-storage', () => {
  it('works', async () => {
    const block = await chain.getBlock()

    expect(await block?.get(sudoKey)).toBe('0x8815a8024b06a5b4c8703418f52125c923f939a5c40a717f6ae3011ba7719019')

    await importStorage(path.join(__dirname, './storage.ok.yml'), chain)

    expect(await block?.get(sudoKey)).toBeUndefined
  })

  it('handle errors', async () => {
    const notExist = path.join(__dirname, 'does_not_exist.yml')
    await expect(importStorage(notExist, chain)).rejects.toThrowError(`File ${notExist} does not exist`)
    await expect(importStorage(path.join(__dirname, 'storage.error.pallet.yml'), chain)).rejects.toThrowError(
      'Cannot find pallet TTechnicalCommittee'
    )
    await expect(importStorage(path.join(__dirname, 'storage.error.storage.yml'), chain)).rejects.toThrowError(
      'Cannot find meta for storage TechnicalCommittee.MMembers'
    )
  })
})
