import { Block } from '../blockchain/block'
import { HexString } from '@polkadot/util/types'
import { decodeStorageDiff } from './decoder'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { template } from 'lodash'
import path from 'node:path'

export const generateHtmlDiff = async (block: Block, diff: [HexString, HexString | null][], filename: string) => {
  const [left, _right, delta] = await decodeStorageDiff(block, diff)
  const htmlTemplate = readFileSync(path.resolve('./template/diff.html'), 'utf-8')
  const html = template(htmlTemplate)({ left: JSON.stringify(left), delta: JSON.stringify(delta) })
  const previewDir = path.resolve('./preview')
  mkdirSync(previewDir, { recursive: true })
  const filePath = path.resolve(previewDir, `${filename}.html`)
  writeFileSync(filePath, html)
  return filePath
}
