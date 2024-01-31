import { describe, expect, it } from 'vitest'
import KeyCache from './key-cache.js'

const KEY_0 = '0x26aa394eea5630e07c48ae0c9558cef7b99d880ec681799c0cf30e8886371da9_00'
const KEY_1 = '0x26aa394eea5630e07c48ae0c9558cef7b99d880ec681799c0cf30e8886371da9_01'
const KEY_2 = '0x26aa394eea5630e07c48ae0c9558cef7b99d880ec681799c0cf30e8886371da9_02'
const KEY_3 = '0x26aa394eea5630e07c48ae0c9558cef7b99d880ec681799c0cf30e8886371da9_03'
const KEY_4 = '0x26aa394eea5630e07c48ae0c9558cef7b99d880ec681799c0cf30e8886371da9_04'
const KEY_5 = '0x26aa394eea5630e07c48ae0c9558cef7b99d880ec681799c0cf30e8886371da9_05'
const KEY_6 = '0x26aa394eea5630e07c48ae0c9558cef7b99d880ec681799c0cf30e8886371da9_06'
const KEY_7 = '0x26aa394eea5630e07c48ae0c9558cef7b99d880ec681799c0cf30e8886371da9_07'
const KEY_8 = '0x26aa394eea5630e07c48ae0c9558cef7b99d880ec681799c0cf30e8886371da9_08'
const KEY_9 = '0x26aa394eea5630e07c48ae0c9558cef7b99d880ec681799c0cf30e8886371da9_09'
const KEY_10 = '0x26aa394eea5630e07c48ae0c9558cef7b99d880ec681799c0cf30e8886371da9_10'
const KEY_11 = '0x26aa394eea5630e07c48ae0c9558cef7b99d880ec681799c0cf30e8886371da9_11'
const KEY_12 = '0x26aa394eea5630e07c48ae0c9558cef7b99d880ec681799c0cf30e8886371da9_12'
const KEY_13 = '0x26aa394eea5630e07c48ae0c9558cef7b99d880ec681799c0cf30e8886371da9_13'
const KEY_14 = '0x26aa394eea5630e07c48ae0c9558cef7b99d880ec681799c0cf30e8886371da9_14'
const KEY_15 = '0x26aa394eea5630e07c48ae0c9558cef7b99d880ec681799c0cf30e8886371da9_15'
const KEY_16 = '0x26aa394eea5630e07c48ae0c9558cef7b99d880ec681799c0cf30e8886371da9_16'

describe('key cache', () => {
  it('should be able to fee keys', async () => {
    const keyCache = new KeyCache(66)
    keyCache.feed([KEY_0, KEY_1, KEY_2, KEY_3, KEY_4])
    expect(await keyCache.next(KEY_1)).toBe(KEY_2)
    expect(await keyCache.next(KEY_3)).toBe(KEY_4)
    expect(await keyCache.next(KEY_4)).toBeUndefined()

    keyCache.feed([KEY_4, KEY_5, KEY_6, KEY_7, KEY_8])
    expect(await keyCache.next(KEY_4)).toBe(KEY_5)
    expect(await keyCache.next(KEY_5)).toBe(KEY_6)
  })

  it("should be able to feed keys that don't intersect", async () => {
    const keyCache = new KeyCache(66)
    keyCache.feed([KEY_3, KEY_4, KEY_5, KEY_6])
    keyCache.feed([KEY_7, KEY_8, KEY_9, KEY_10])
    expect(keyCache.ranges.length).toBe(2)
    expect(await keyCache.next(KEY_6)).toBeUndefined()
    expect(await keyCache.next(KEY_3)).toBe(KEY_4)
    expect(await keyCache.next(KEY_7)).toBe(KEY_8)

    keyCache.feed([KEY_12, KEY_13, KEY_14, KEY_15, KEY_16])
    expect(await keyCache.next(KEY_11)).toBeUndefined()
    expect(keyCache.ranges.length).toBe(3)

    keyCache.feed([KEY_1, KEY_2, KEY_3, KEY_4, KEY_5])
    expect(await keyCache.next(KEY_1)).toBe(KEY_2)
    expect(await keyCache.next(KEY_5)).toBe(KEY_6)
    expect(keyCache.ranges.length).toBe(3)

    keyCache.feed([KEY_9, KEY_10, KEY_11, KEY_12, KEY_13, KEY_14])
    expect(keyCache.ranges.length).toBe(3)
    expect(await keyCache.next(KEY_9)).toBe(KEY_10)
    keyCache.feed([KEY_10, KEY_11])
    expect(await keyCache.next(KEY_9)).toBe(KEY_10)
    expect(await keyCache.next(KEY_10)).toBe(KEY_11)
    expect(await keyCache.next(KEY_11)).toBe(KEY_12)
  })
})
