import { HexString } from '@polkadot/util/types'
import _ from 'lodash'

// 0x + 32 module + 32 method
export const PREFIX_LENGTH = 66

export default class KeyCache {
  readonly ranges: Array<{ prefix: string; keys: string[] }> = []

  feed(keys: HexString[]) {
    const _keys = keys.filter((key) => key.length >= PREFIX_LENGTH)
    if (_keys.length === 0) return
    const startKey = _keys[0].slice(PREFIX_LENGTH)
    const endKey = _keys[_keys.length - 1].slice(PREFIX_LENGTH)
    const grouped = _.groupBy(_keys, (key) => key.slice(0, PREFIX_LENGTH))
    for (const [prefix, keys] of Object.entries(grouped)) {
      const ranges = this.ranges.filter((range) => range.prefix === prefix)

      if (ranges.length === 0) {
        // no existing range with prefix
        this.ranges.push({ prefix, keys: keys.map((i) => i.slice(PREFIX_LENGTH)) })
        continue
      }

      let merged = false
      for (const range of ranges) {
        const startPosition = _.sortedIndex(range.keys, startKey)
        if (startPosition >= 0 && range.keys[startPosition] === startKey) {
          // found existing range with prefix
          range.keys.splice(startPosition, keys.length, ...keys.map((i) => i.slice(PREFIX_LENGTH)))
          merged = true
          break
        }
        const endPosition = _.sortedIndex(range.keys, endKey)
        if (endPosition >= 0 && range.keys[endPosition] === endKey) {
          // found existing range with prefix
          range.keys.splice(0, endPosition + 1, ...keys.map((i) => i.slice(PREFIX_LENGTH)))
          merged = true
          break
        }
      }

      // insert new prefix with range
      if (!merged) {
        this.ranges.push({ prefix, keys: keys.map((i) => i.slice(PREFIX_LENGTH)) })
      }
    }

    // TODO: merge ranges if they overlap
  }

  async next(startKey: HexString): Promise<HexString | undefined> {
    if (startKey.length < PREFIX_LENGTH) return
    const prefix = startKey.slice(0, PREFIX_LENGTH)
    const key = startKey.slice(PREFIX_LENGTH)
    for (const range of this.ranges.filter((range) => range.prefix === prefix)) {
      const index = _.sortedIndex(range.keys, key)
      if (range.keys[index] !== key) continue
      const nextKey = range.keys[index + 1]
      if (nextKey) {
        return [prefix, nextKey].join('') as HexString
      }
    }
  }
}
