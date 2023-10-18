import { afterAll, describe, expect, it } from 'vitest'

import networks from './networks'

describe('Batch request', async () => {
  const acala = await networks.acala()
  const { chain, wsClient } = acala

  afterAll(async () => {
    await acala.teardown()
  })

  it('batch getStorage', async () => {
    const blockNumber = chain.head.number

    const isFinish = new Promise<void>((resolve) => {
      wsClient.once('finished', () => {
        resolve()
      })
    })

    wsClient.on('message', (data: any) => {
      const response = JSON.parse(data)

      expect(response).toMatchSnapshot()
      wsClient.emit('finished')
    })

    wsClient.send(
      JSON.stringify([
        {
          method: 'chain_getBlockHash',
          params: [blockNumber],
          id: 2,
          jsonrpc: '2.0',
        },
        {
          method: 'not_found',
          params: [''],
          id: 3,
          jsonrpc: '2.0',
        },
      ]),
    )

    await isFinish
  })
})
