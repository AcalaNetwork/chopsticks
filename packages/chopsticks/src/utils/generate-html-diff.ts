import { Block } from '@acala-network/chopsticks-core'
import { HexString } from '@polkadot/util/types'
import { decodeStorageDiff } from './decoder'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import _ from 'lodash'
import url from 'node:url'

export const generateHtmlDiff = async (block: Block, diff: [HexString, HexString | null][]) => {
  const { oldState, delta } = await decodeStorageDiff(block, diff)
  const htmlTemplate = readFileSync(url.resolve(__filename, './template/diff.html'), 'utf-8')
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
