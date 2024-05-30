import { ApiPromise } from '@polkadot/api'
import { WsProvider } from '@polkadot/rpc-provider'
import { z } from 'zod'
import _ from 'lodash'
import type { Argv } from 'yargs'

import { configSchema, getYargsOptions } from '../../schema/index.js'
import { fetchStorage, logger } from '../../utils/fetch-storages.js'

const schema = z.object({
  ..._.pick(configSchema.shape, ['endpoint', 'block', 'db']),
})

export const cli = (y: Argv) => {
  y.command({
    command: 'fetch-storages [items..]',
    aliases: ['fetch-storage'],
    describe: 'Fetch and save storages',
    builder: (yargs) => yargs.options(getYargsOptions(schema.shape)),
    handler: async (argv) => {
      const config = schema.parse(argv)
      if (!config.endpoint) throw new Error('endpoint is required')
      const fetchStorageConfig = argv.items as any
      if (!fetchStorageConfig) throw new Error('fetch-storages items are required')
      const provider = new WsProvider(config.endpoint, 3_000)
      const apiPromise = new ApiPromise({ provider })
      await apiPromise.isReady

      try {
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

        await fetchStorage({
          blockHash,
          dbPath: config.db ?? 'db.sqlite',
          apiPromise,
          provider,
          config: fetchStorageConfig,
        })
      } catch (e) {
        logger.error(e, 'Error when fetching storages')
        await apiPromise?.disconnect()
        process.exit(1)
      }
    },
  })
}
