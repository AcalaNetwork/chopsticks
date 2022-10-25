import { describe, it } from 'vitest'

import { api, expectJson } from './helper'

describe.only('storage', () => {
  it('getStorage', async () => {
    await expectJson(api.query.timestamp.now()).toMatchInlineSnapshot('1666661202090')
    await expectJson(
      api.query.tokens.accounts('5F98oWfz2r5rcRVnP9VCndg33DAAsky3iuoBSpaPUbgN9AJn', { Token: 'ACA' })
    ).toMatchInlineSnapshot()
  })
})
