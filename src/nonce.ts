import { ApiPromise } from '@polkadot/api'
import { TypeRegistry } from '@polkadot/types'
import { hexToU8a } from '@polkadot/util'

import { Config } from './schema'
import { runTask, taskHandler } from './executor'
import { setup } from './setup'

export const nonce = async (argv: Config) => {
  const accountId = argv['accountId'] as `0x${string}`

  const context = await setup(argv)
  const wasm = await context.chain.head.wasm
  const block = context.chain.head
  const parent = await block.parentBlock

  const getNonce = async () => {
    const result = await runTask(
      {
        wasm,
        calls: [['AccountNonceApi_account_nonce', accountId]],
        storage: [],
        mockSignatureHost: false,
        allowUnresolvedImports: false,
      },
      taskHandler(parent)
    )
    if (result.Error) {
      throw new Error(result.Error)
    }

    const registry = new TypeRegistry();
    return {
      result: registry.createType('u64', hexToU8a(result.Call.result)).toNumber(),
      accessedStorageKeys: result.Call.accessedStorageKeys,
    }
  }

  const { accessedStorageKeys } = await getNonce()

  const api = await ApiPromise.create({ provider: context.api.provider })
  const unsub = await api.rpc.state.subscribeStorage(accessedStorageKeys, async (_changes) => {
    const nonce = await getNonce();
    console.log('>>> nonce:', nonce.result)
  })

  // process.exit(0)
}
