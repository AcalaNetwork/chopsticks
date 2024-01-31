import { Block, decodeBlockStorageDiff } from '@acala-network/chopsticks-core'
import { HexString } from '@polkadot/util/types'
import { create } from 'jsondiffpatch'
import _ from 'lodash'

const diffPatcher = create({
  arrays: { detectMove: false },
  textDiff: { minLength: Number.MAX_VALUE }, // skip text diff
})

export const decodeStorageDiff = async (block: Block, diff: [HexString, HexString | null][]) => {
  const [oldState, newState] = await decodeBlockStorageDiff(block, diff)
  const oldStateWithoutEvents = _.cloneDeep(oldState)
  if (oldStateWithoutEvents['system']?.['events']) {
    oldStateWithoutEvents['system']['events'] = []
  }
  return { oldState, newState, delta: diffPatcher.diff(oldStateWithoutEvents, newState) }
}
