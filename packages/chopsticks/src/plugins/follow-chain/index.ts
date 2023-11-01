import { ApiPromise, HttpProvider, WsProvider } from '@polkadot/api'
import { ProviderInterface } from '@polkadot/rpc-provider/types'
import { defaultLogger } from '@acala-network/chopsticks-core'
import _ from 'lodash'
import type yargs from 'yargs'

import { Config } from '../../schema'
import { defaultOptions } from '../../cli-options'
import { setupContext } from '../../context'

const options = _.pick(defaultOptions, ['endpoint', 'wasm-override', 'runtime-log-level', 'offchain-worker'])
const logger = defaultLogger.child({ name: 'follow-chain' })

export const cli = (y: yargs.Argv) => {
  y.command(
    'follow-chain',
    'Always follow the latest block on upstream',
    (yargs) => yargs.options(options),
    async (argv) => {
      const { chain } = await setupContext(argv as Config, true)

      let provider: ProviderInterface
      const endpoint = argv.endpoint as string
      if (/^(https|http):\/\//.test(endpoint || '')) {
        provider = new HttpProvider(endpoint as string)
      } else {
        provider = new WsProvider(endpoint as string)
      }
      const apiPromise = await ApiPromise.create({
        provider,
        signedExtensions: {
          SetEvmOrigin: {
            extrinsic: {},
            payload: {},
          },
        },
      })

      await apiPromise.isReady

      apiPromise.rpc.chain.subscribeFinalizedHeads(async (header) => {
        logger.info({ header: header.toJSON() }, 'New head from upstream')
        const block = await chain.getBlock(header.hash.toHex())
        if (!block) throw Error(`cant find block ', ${header.hash.toHex()}`)
        logger.info({ blockNumber: block?.number }, 'New block')
        await chain.setHead(block)
      })
    },
  )
}
