import { z } from 'zod'
import _ from 'lodash'
import type { Argv } from 'yargs'

import { configSchema, getYargsOptions } from '../../schema/index.js'
import { fetchStorages } from '../../utils/fetch-storages.js'

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
      if (!argv.items) throw new Error('fetch-storages items are required')

      try {
        await fetchStorages({
          block: config.block,
          endpoint: config.endpoint,
          dbPath: config.db,
          config: argv.items as any,
        })
        process.exit(0)
      } catch (e) {
        process.exit(1)
      }
    },
  })
}
