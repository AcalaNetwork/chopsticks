import '@polkadot/types-codec'
import { u8aToHex } from '@polkadot/util'

import { setup } from './setup'

export const decodeKey = async (argv: any) => {
  const context = await setup(argv)

  const key = argv.key
  const meta = await context.chain.head.meta
  outer: for (const module of Object.values(meta.query)) {
    for (const storage of Object.values(module)) {
      const keyPrefix = u8aToHex(storage.keyPrefix())
      if (key.startsWith(keyPrefix)) {
        const decodedKey = meta.registry.createType('StorageKey', key)
        decodedKey.setMeta(storage.meta)
        console.log(
          `${storage.section}.${storage.method}`,
          decodedKey.args.map((x) => JSON.stringify(x.toHuman())).join(', ')
        )
        break outer
      }
    }
  }

  setTimeout(() => process.exit(0), 50)
}
