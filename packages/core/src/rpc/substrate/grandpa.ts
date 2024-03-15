import { blake2AsHex } from '@polkadot/util-crypto'

import { Block } from '../../blockchain/block.js'
import { Handler } from '../shared.js'

export const grandpa_subscribeJustifications: Handler<void, string> = async (context, _params, { subscribe }) => {
  let update = (_block: Block) => {}

  const id = context.chain.headState.subscribeHead((block) => update(block))
  const callback = subscribe('grandpa_justifications', id, () => context.chain.headState.unsubscribeHead(id))

  update = async (block: Block) => {
    // Proof needs to be different for each block
    callback(blake2AsHex(block.hash))
  }

  setTimeout(() => update(context.chain.head), 50)

  return id
}

export const grandpa_unsubscribeJustifications: Handler<[string], void> = async (
  _context,
  [subid],
  { unsubscribe },
) => {
  unsubscribe(subid)
}
