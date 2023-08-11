import { Config } from '../../schema'
import { HexString } from '@polkadot/util/types'
import { decodeKey } from '@acala-network/chopsticks-core'
import { defaultOptions } from '../../cli-options'
import { setupContext } from '../../context'
import type yargs from 'yargs'

export const cli = (y: yargs.Argv) => {
  y.command(
    'decode-key <key>',
    'Deocde a key',
    (yargs) =>
      yargs
        .positional('key', {
          desc: 'Key to decode',
          type: 'string',
        })
        .options({
          ...defaultOptions,
        }),
    async (argv) => {
      const context = await setupContext(argv as Config)
      const { storage, decodedKey } = decodeKey(
        await context.chain.head.meta,
        context.chain.head,
        argv.key as HexString,
      )
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
