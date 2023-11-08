import { Block } from '@acala-network/chopsticks-core'
import { HexString } from '@polkadot/util/types'
import { decodeStorageDiff } from './decoder.js'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import _ from 'lodash'

export const generateHtmlDiff = async (block: Block, diff: [HexString, HexString | null][]) => {
  const { oldState, delta } = await decodeStorageDiff(block, diff)
  const htmlTemplate = readFileSync(new URL('template/diff.html', import.meta.url), 'utf-8')
  return _.template(htmlTemplate)({ left: JSON.stringify(oldState), delta: JSON.stringify(delta) })
}

export const generateHtmlDiffPreviewFile = async (
  block: Block,
  diff: [HexString, HexString | null][],
  filename: string,
) => {
  const html = await generateHtmlDiff(block, diff)
  mkdirSync('./preview', { recursive: true })
  const filePath = `./preview/${filename}.html`
  writeFileSync(filePath, html)
  return filePath
}
