import { describe, expect, it } from 'vitest'

import { filterXcmMessages } from './upward.js'

describe('filterXcmMessages', () => {
  it('returns all messages when no separator present', () => {
    const messages = ['xcm1', 'xcm2']
    expect(filterXcmMessages(messages)).toEqual(['xcm1', 'xcm2'])
  })

  it('returns only messages before the separator', () => {
    const messages = ['xcm1', 'xcm2', '', 'sig1', 'sig2']
    expect(filterXcmMessages(messages)).toEqual(['xcm1', 'xcm2'])
  })

  it('returns empty array when separator is first', () => {
    const messages = ['', 'sig1', 'sig2']
    expect(filterXcmMessages(messages)).toEqual([])
  })

  it('returns empty array for empty input', () => {
    expect(filterXcmMessages([])).toEqual([])
  })

  it('returns messages before separator when separator is last', () => {
    const messages = ['xcm1', '']
    expect(filterXcmMessages(messages)).toEqual(['xcm1'])
  })
})
