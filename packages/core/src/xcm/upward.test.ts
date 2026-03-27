import { describe, expect, it } from 'vitest'

import { filterXcmMessages } from './upward.js'

describe('filterXcmMessages', () => {
  it('returns all messages when no separator present', () => {
    const messages = ['0xdeadbeef', '0xcafebabe']
    expect(filterXcmMessages(messages)).toEqual(['0xdeadbeef', '0xcafebabe'])
  })

  it('returns only messages before the separator', () => {
    const messages = ['0xdeadbeef', '0xcafebabe', '0x', '0x01020304', '0xaabbccdd']
    expect(filterXcmMessages(messages)).toEqual(['0xdeadbeef', '0xcafebabe'])
  })

  it('returns empty array when separator is first', () => {
    const messages = ['0x', '0x01020304', '0xaabbccdd']
    expect(filterXcmMessages(messages)).toEqual([])
  })

  it('returns empty array for empty input', () => {
    expect(filterXcmMessages([])).toEqual([])
  })

  it('returns all messages when separator is last (no signals after it)', () => {
    const messages = ['0xdeadbeef', '0x']
    expect(filterXcmMessages(messages)).toEqual(['0xdeadbeef'])
  })
})
