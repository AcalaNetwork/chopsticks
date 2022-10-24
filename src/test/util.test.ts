import { describe, it, expect } from 'vitest'
import { fetchKeys } from '../utils'

describe('suite', () => {
  it('serial test', async () => {
    await expect(fetchKeys(1 as any, 2 as any)).rejects.toThrowError()
  })
})
