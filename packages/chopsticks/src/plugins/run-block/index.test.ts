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

  it('should work for acala', async () => {
    const chain = await setup({
      endpoint: 'wss://acala-rpc.aca-api.network',
      block: 4851233,
      db: !process.env.RUN_TESTS_WITHOUT_DB ? new SqliteDatabase('e2e-tests-db.sqlite') : undefined,
    })

    const parseBlock = async (n) => {
      const block = (await chain.getBlockAt(n))!
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
    }

    await parseBlock(4851229)
    await parseBlock(4851230)
    await parseBlock(4851231)

    await chain.close()
  }, 90000)
})
