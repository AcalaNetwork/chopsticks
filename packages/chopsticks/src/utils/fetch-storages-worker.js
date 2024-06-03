import * as Comlink from 'comlink'
import { parentPort } from 'node:worker_threads'
import nodeEndpoint from 'comlink/dist/umd/node-adapter.js'

import { fetchStorages } from './fetch-storages.js'

const api = {
  startFetch: async ({ ...options }) => {
    await fetchStorages({ ...options })
  },
}

Comlink.expose(api, nodeEndpoint(parentPort))
