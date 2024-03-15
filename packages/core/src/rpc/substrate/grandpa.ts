import { Handler } from '../shared.js'

export const grandpa_subscribeJustifications: Handler<void, string> = async (context, _params, { subscribe }) => {
  let update = () => {}

  const id = context.chain.headState.subscribeHead(() => update())
  const callback = subscribe('grandpa_justifications', id, () => context.chain.headState.unsubscribeHead(id))

  update = async () => {
    const mockProof = '0x' + '7'.repeat(64)
    callback(mockProof)
  }

  setTimeout(update, 50)

  return id
}

export const grandpa_unsubscribeJustifications: Handler<[string], void> = async (
  _context,
  [subid],
  { unsubscribe },
) => {
  unsubscribe(subid)
}
