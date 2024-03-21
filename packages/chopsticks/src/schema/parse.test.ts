import { describe, expect, it } from 'vitest'
import { readdirSync } from 'fs'
import _ from 'lodash'
import path from 'path'

import { configSchema, fetchConfig } from './index.js'

function getAllFiles(dirPath: string) {
  const files = readdirSync(dirPath)
  const arrayOfFiles: string[] = []
  files.forEach(function (file) {
    arrayOfFiles.push(path.join(dirPath, '/', file))
  })

  return arrayOfFiles
}

describe('Existing configs', async () => {
  const configPaths = getAllFiles(path.join(__dirname, '../../../../configs'))
  it.each(configPaths.map((p) => ({ name: _.last(p.split('/')), path: p })))(
    '$name config parsing is correct',
    async ({ path }) => {
      const config = await fetchConfig(path)
      expect(() => configSchema.parse(config)).not.toThrow()
    },
  )
})

describe('Parsed options', () => {
  const defaults = {
    port: 8000,
    'build-block-mode': 'Batch',
  }
  it('parsed multi type options should work', () => {
    expect(
      configSchema.parse({
        block: 4500000,
      }),
    ).toEqual({
      block: 4500000,
      ...defaults,
    })

    expect(
      configSchema.parse({
        block: '4500000',
      }),
    ).toEqual({
      block: '4500000',
      ...defaults,
    })

    expect(
      configSchema.parse({
        block: '0xb10f03bbc183da4d26e27528d28f6a73ddaf182fb6400ca363b77d2411ea5b0c',
      }),
    ).toEqual({
      block: '0xb10f03bbc183da4d26e27528d28f6a73ddaf182fb6400ca363b77d2411ea5b0c',
      ...defaults,
    })

    expect(() =>
      configSchema.parse({
        // eslint-disable-next-line @typescript-eslint/no-loss-of-precision
        block: 0xb10f03bbc183da4d26e27528d28f6a73ddaf182fb6400ca363b77d2411ea5b0c,
      }),
    ).toThrowError(/you are uing a hex string/)
  })
})
