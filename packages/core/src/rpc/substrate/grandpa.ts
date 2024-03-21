import { compactAddLength, u8aToHex } from '@polkadot/util'

import { Block } from '../../blockchain/block.js'
import { Handler } from '../shared.js'

export const grandpa_subscribeJustifications: Handler<void, string> = async (context, _params, { subscribe }) => {
  let update = (_block: Block) => {}

  const id = context.chain.headState.subscribeHead((block) => update(block))
  const callback = subscribe('grandpa_justifications', id, () => context.chain.headState.unsubscribeHead(id))

  update = async (block: Block) => {
    const meta = await block.meta
    const validatorSetIdRaw = await block.get('0x08c41974a97dbf15cfbec28365bea2da8f05bccc2f70ec66a32999c5761156be')
    const validatorSetId = meta.registry.createType('u64', validatorSetIdRaw || 0)
    const beefyProof = meta.registry.createType('BeefyVersionedFinalityProof', {
      V1: {
        commitment: {
          payload: [], // TODO: do we need to fill this?
          blockNumber: block.number,
          validatorSetId,
        },
        signatures: [], // TODO: do we need to fill this?
      },
    })
    const justification = meta.registry.createType('Justification', ['BEEF', compactAddLength(beefyProof.toU8a())])
    callback(u8aToHex(justification.toU8a()))
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
