import { Block } from '../../blockchain/block.js'
import { Handler } from '../shared.js'
import { compactHex } from '../../utils/index.js'

export const grandpa_subscribeJustifications: Handler<void, string> = async (context, _params, { subscribe }) => {
  let update = (_block: Block) => {}

  const id = context.chain.headState.subscribeHead((block) => update(block))
  const callback = subscribe('grandpa_justifications', id, () => context.chain.headState.unsubscribeHead(id))

  update = async (block: Block) => {
    const meta = await block.meta
    const validatorSetId = await block.read('u64', meta.query.beefy.validatorSetId)
    if (!validatorSetId) {
      throw new Error('Cannot find validator set id')
    }
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
    const justification = meta.registry.createType('Justification', ['BEEF', compactHex(beefyProof.toU8a())]).toHex()
    callback(justification)
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
