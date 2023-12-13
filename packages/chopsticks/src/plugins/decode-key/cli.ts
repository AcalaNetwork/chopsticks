import { HexString } from '@polkadot/util/types'
import { configSchema, getYargsOptions } from '../../schema/index.js'
import { decodeKey } from '@acala-network/chopsticks-core'
import { setupContext } from '../../context.js'
import type { Argv } from 'yargs'

export const cli = (y: Argv) => {
  y.command(
    'decode-key <key>',
    'Deocde a key',
    (yargs) =>
      yargs.options(getYargsOptions(configSchema.shape)).positional('key', {
        desc: 'Key to decode',
        type: 'string',
      }),
    async (argv) => {
      const context = await setupContext(configSchema.parse(argv))
      const { storage, decodedKey } = decodeKey(await context.chain.head.meta, argv.key as HexString)
      if (storage && decodedKey) {
        console.log(
          `${storage.section}.${storage.method}`,
          decodedKey.args.map((x) => JSON.stringify(x.toHuman())).join(', '),
        )
      } else {
        console.log('Unknown')
      }
      process.exit(0)
    },
  )
}
