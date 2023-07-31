/// <reference lib="dom" />
/// <reference lib="dom.iterable" />

const app = document.getElementById('app') as HTMLDivElement
const extrinsic = document.getElementById('extrinsic') as HTMLTextAreaElement
const submit = document.getElementById('submit') as HTMLInputElement
const result = document.getElementById('result') as HTMLPreElement

import localforage from 'localforage'
import { setStorage, setup } from '@acala-network/chopsticks-core'

globalThis.localforage = localforage.createInstance({ name: 'chopsticks' })

;(async () => {
  const chain = await setup({
    endpoint: 'wss://acala-rpc-0.aca-api.network',
    block: 4_000_000,
    mockSignatureHost: true,
    db: "cache"
  })
  globalThis.chain = chain

  await setStorage(chain, {
    System: {
      Account: [
        [
          ['5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY'],
          {
            providers: 1,
            data: {
              free: '1000000000000000000',
            },
          },
        ],
      ],
    },
  })

  submit.onclick = async () => {
    result.innerHTML = 'Running...'
    submit.disabled = true
    const call = extrinsic.value.trim() as any
    extrinsic.value = ''
    try {
      const { outcome, storageDiff } = await chain.dryRunExtrinsic({
        call,
        address: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
      })
      result.innerHTML = JSON.stringify({ outcome: outcome.toHuman(), storageDiff }, null, 2)
    } catch (e: any) {
      result.innerHTML = e.toString()
    }
    submit.disabled = false
  }

  app.innerHTML = chain.head.number + ' ' + chain.head.hash + '<br>'
  await chain.newBlock()
  app.innerHTML += chain.head.number + ' ' + chain.head.hash
})()
