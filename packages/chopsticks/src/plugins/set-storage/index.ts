import { Context, ResponseError, StorageValues, setStorage } from '@acala-network/chopsticks-core'
import { HexString } from '@polkadot/util/types'

import { defaultLogger } from '../../logger'

/**
 * Set storage values.
 *
 * This function is a dev rpc handler. Use `dev_setStorage` as the method name when calling it.
 *
 * @param context - The context object of the rpc handler
 * @param params - The parameters of the rpc handler
 *
 * @example
 * ```ts
 * import { WsProvider } from '@polkadot/api'
 * import { Keyring } from '@polkadot/keyring'
 *
 * const ws = new WsProvider(`ws://localhost:8000`)
 * const keyring = new Keyring({ type: 'ed25519' })
 * const bob = keyring.addFromUri('//Bob')
 *
 * const storage = {
 *   System: {
 *     Account: [[[bob.address], { data: { free: 100000 }, nonce: 1 }]],
 *   },
 * }
 * await ws.send('dev_setStorage', [storage])
 * ```
 */

export const rpc = async (context: Context, params: [StorageValues, HexString?]) => {
  const [values, blockHash] = params
  const hash = await setStorage(context.chain, values, blockHash).catch((error) => {
    throw new ResponseError(1, error.toString())
  })
  defaultLogger.debug(
    {
      hash,
      values,
    },
    'dev_setStorage',
  )
  return hash
}
