import { describe, expect, it } from 'vitest'

import { env, setupApi, ws } from './helper.js'

setupApi(env.acala)

describe('http.server', () => {
  it('works', async () => {
    const port = /:(\d+$)/.exec(ws.endpoint)?.[1]
    if (!port) {
      throw new Error('cannot found port')
    }

    {
      const res = await fetch(`http://localhost:${port}`, {
        method: 'POST',
        body: JSON.stringify({ id: 1, jsonrpc: '2.0', method: 'chain_getBlockHash', params: [] }),
      })
      expect(await res.json()).toMatchInlineSnapshot(
        `"0x0df086f32a9c3399f7fa158d3d77a1790830bd309134c5853718141c969299c7"`,
      )
    }

    {
      const res = await fetch(`http://localhost:${port}`, {
        method: 'POST',
        body: JSON.stringify({ id: 1, jsonrpc: '2.0', method: 'system_health', params: [] }),
      })
      expect(await res.json()).toMatchInlineSnapshot(`
      {
        "isSyncing": false,
        "peers": 0,
        "shouldHavePeers": false,
      }
    `)
    }

    {
      const res = await fetch(`http://localhost:${port}`, {
        method: 'POST',
        body: JSON.stringify({ id: 1, jsonrpc: '2.0', method: 'system_invalid', params: [] }),
      })
      expect(await res.json()).toMatchInlineSnapshot(
        `
        {
          "error": {
            "message": "Method not found: system_invalid",
          },
          "id": 1,
          "jsonrpc": "2.0",
        }
      `,
      )
    }

    {
      const res = await fetch(`http://localhost:${port}`, {
        method: 'POST',
        body: JSON.stringify({ id: 1, jsonrpc: '2.0', method: 'chain_subscribeNewHeads', params: [] }),
      })
      expect(await res.json()).toMatchInlineSnapshot(
        `
        {
          "error": {
            "message": "Subscription is not supported",
          },
          "id": 1,
          "jsonrpc": "2.0",
        }
      `,
      )
    }
  })
})
