import { ApiPromise } from '@polkadot/api'
import { WsProvider } from '@polkadot/rpc-provider'
import { defaultLogger } from '@acala-network/chopsticks-core'
import { z } from 'zod'
import _ from 'lodash'
import type { Argv } from 'yargs'

import { configSchema, getYargsOptions } from '../../schema/index.js'
import { fetchStorage } from '../../utils/fetch-storages.js'

const logger = defaultLogger.child({ name: 'fetch-storage' })

const schema = z.object({
  ..._.pick(configSchema.shape, ['endpoint', 'block', 'db']),
})

export const cli = (y: Argv) => {
  y.command(
    'fetch-storages',
    'Fetch and save storages',
    (yargs) => yargs.options(getYargsOptions(schema.shape)),
    async (argv) => {
      const config = schema.parse(argv)
      const fetchStorageConfig = argv._.map((p) => (typeof p === 'number' ? p.toString() : p))
      let apiPromise: ApiPromise | undefined

      try {
        if (!config.endpoint) throw new Error('endpoint is required')
        apiPromise = new ApiPromise({ provider: new WsProvider(config.endpoint, 3_000) })
        await apiPromise.isReady

        let blockHash: string
        if (config.block == null) {
          const lastHdr = await apiPromise.rpc.chain.getHeader()
          blockHash = lastHdr.hash.toString()
        } else if (typeof config.block === 'string' && config.block.startsWith('0x')) {
          blockHash = config.block as string
        } else if (Number.isInteger(+config.block)) {
          blockHash = await apiPromise.rpc.chain.getBlockHash(Number(config.block)).then((h) => h.toString())
        } else {
          throw new Error(`Invalid block number or hash: ${config.block}`)
        }

        await fetchStorage(blockHash, config.db ?? 'dp.sqlite', apiPromise, fetchStorageConfig, logger)
      } catch (e) {
        logger.error(e, 'Error when processing new head')
        await apiPromise?.disconnect()
        process.exit(1)
      }
    },
  )
}
