import { SqliteDatabase } from '@acala-network/chopsticks-db'
import { describe, expect, it } from 'vitest'
import { setup } from '@acala-network/chopsticks-core'

import { rpc } from './index.js'

describe('run-block', () => {
  it('should work', async () => {
    const chain = await setup({
      endpoint: 'wss://rpc.ibp.network/polkadot',
      block: 18000002,
      db: !process.env.RUN_TESTS_WITHOUT_DB ? new SqliteDatabase('e2e-tests-db.sqlite') : undefined,
    })

    const block = (await chain.getBlockAt(18000002))!
    const header = await block.header
    const parent = header.parentHash.toHex()

    const result = await rpc({ chain }, [
      {
        includeRaw: true,
        includeParsed: true,
        includeBlockDetails: true,
        parent,
        block: {
          header: header.toJSON(),
          extrinsics: await block.extrinsics,
        },
      },
    ])
    expect(result).toMatchSnapshot()

    await chain.close()
  }, 90000)
})
