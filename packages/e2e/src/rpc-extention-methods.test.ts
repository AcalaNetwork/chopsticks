import { join, resolve } from 'node:path'
import { getRpcExtensionMethods, loadRpcMethodsByScripts } from '@acala-network/chopsticks/plugins/index.js'
import { describe, expect, it } from 'vitest'
import { env, setupApi, ws } from './helper.js'

setupApi(env.acala)

describe('rpc methods load by scripts', () => {
  it('before load', async () => {
    const methods = getRpcExtensionMethods()
    console.log(methods)
    expect(methods.includes('dev_runBlock')).eq(true)
    expect(methods.includes('testdev_testRpcMethod1')).eq(false)
    expect(methods.includes('testdev_testRpcMethod2')).eq(false)
  })
  it('loaded', async () => {
    loadRpcMethodsByScripts(resolve(join(__dirname, 'rpc-methods-test-scripts.js')))

    const methods = getRpcExtensionMethods()
    expect(methods.includes('dev_runBlock')).eq(true)
    expect(methods.includes('testdev_testRpcMethod1')).eq(true)
    expect(methods.includes('testdev_testRpcMethod2')).eq(true)
  })
  it('server rpc test', async () => {
    const port = /:(\d+$)/.exec(ws.endpoint)?.[1]
    if (!port) {
      throw new Error('cannot found port')
    }

    {
      const res = await fetch(`http://localhost:${port}`, {
        method: 'POST',
        body: JSON.stringify({ id: 1, jsonrpc: '2.0', method: 'testdev_testRpcMethod1', params: [] }),
      })
      expect(await res.json()).toMatchInlineSnapshot(
        `
        {
          "id": 1,
          "jsonrpc": "2.0",
          "result": {
            "methods": 1,
            "params": [],
          },
        }
      `,
      )
    }
    {
      const res = await fetch(`http://localhost:${port}`, {
        method: 'POST',
        body: JSON.stringify({ id: 1, jsonrpc: '2.0', method: 'testdev_testRpcMethod2', params: [2] }),
      })
      expect(await res.json()).toMatchInlineSnapshot(
        `
        {
          "id": 1,
          "jsonrpc": "2.0",
          "result": {
            "methods": 2,
            "params": [
              2,
            ],
          },
        }
      `,
      )
    }
  })
})
