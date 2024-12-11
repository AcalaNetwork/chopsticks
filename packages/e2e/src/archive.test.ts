import { describe, expect, it } from 'vitest'

import { api, env, setupApi } from './helper.js'

setupApi(env.acala)

describe('archive rpc', () => {
  it('archive_unstable_XXX', async () => {
    const hash1000 = '0x1d2927c6b4aca4c42cb1f88ed7fa46dc53118bb00370475aaf514ac88933e3cc'

    expect(await api.rpc('archive_unstable_body', hash1000)).toMatchSnapshot()

    // alias works
    expect(await api.rpc('archive_unstable_hashByHeight', [1000])).toEqual(expect.arrayContaining([hash1000]))
  })
})
