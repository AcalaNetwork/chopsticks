import { Block } from '../blockchain/block'
import { HexString } from '@polkadot/util/types'
import { decodeStorageDiff } from './decoder'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { template } from 'lodash'

export const generateHtmlDiff = async (block: Block, diff: [HexString, HexString | null][], filename: string) => {
  const [left, _right, delta] = await decodeStorageDiff(block, diff)
  const htmlTemplate = readFileSync('./template/diff.html', 'utf-8')
  const html = template(htmlTemplate)({ left: JSON.stringify(left), delta: JSON.stringify(delta) })
  mkdirSync('./preview')
  const filePath = `./preview/${filename}.html`
  writeFileSync(filePath, html)
  return filePath
}
