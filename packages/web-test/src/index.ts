/// <reference lib="dom" />
/// <reference lib="dom.iterable" />

import { setup } from '@acala-network/chopsticks-core'
;(async () => {
  const chain = await setup({
    endpoint: 'wss://acala-rpc-0.aca-api.network',
    block: 4_000_000,
    mockSignatureHost: true,
  })
  globalThis.chain = chain
  const app = document.getElementById('app')
  if (!app) throw new Error('Cannot find div.#app')
  app.innerHTML = chain.head.number + ' ' + chain.head.hash + '<br>'
  await chain.newBlock()
  app.innerHTML += chain.head.number + ' ' + chain.head.hash
})()
