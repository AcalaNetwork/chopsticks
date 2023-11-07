import { describe, expect, it } from 'vitest'

import { setup } from '@acala-network/chopsticks-core'

import { rpc } from '.'

describe('run-block', () => {
  it('should work', async () => {
    const chain = await setup({
      endpoint: 'wss://rpc.polkadot.io',
      block: 18000000,
    })

    const block = (await chain.getBlockAt(18000000))!
    const header = await block.header
    const parent = header.parentHash.toHex()

    expect(
      await rpc({ chain }, [
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
      ]),
    ).toMatchSnapshot()

    await chain.close()
  }, 90000)
})
