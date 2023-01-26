import { ApiPromise } from '@polkadot/api'
import { TypeRegistry } from '@polkadot/types'
import { hexToU8a } from '@polkadot/util'
import { HexString } from '@polkadot/util/types'
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { Config } from './schema'
import { runTask, taskHandler } from './executor'
import { setup } from './setup'

const getCode = () => {
  const buffer = readFileSync(path.join(__dirname, '../acala-view-wasm/target/debug/wbuild/acala-view-wasm/acala_view_wasm.wasm'))
  const code = buffer.toString('hex')
  return ('0x' + code) as HexString
}

export const balance = async (argv: Config) => {
  const accountId = argv['accountId'] as `0x${string}`

  const context = await setup(argv)
  const block = context.chain.head
  const parent = await block.parentBlock

  const getBalance = async () => {
    const result = await runTask(
      {
        wasm: getCode(),
        // calls: [['AcalaViewApi_pho', '0x']],
        calls: [['AcalaViewApi_balance', accountId]],
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
      result: registry.createType('u128', hexToU8a(result.Call.result)).toNumber(),
      accessedStorageKeys: result.Call.accessedStorageKeys,
    }
  }

  const { accessedStorageKeys } = await getBalance()

  const api = await ApiPromise.create({ provider: context.api.provider })
  const unsub = await api.rpc.state.subscribeStorage(accessedStorageKeys, async (_changes) => {
    const balance = await getBalance();
    console.log('>>> balance:', balance.result)
  })

  // process.exit(0)
}
