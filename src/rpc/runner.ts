import { Handlers } from './shared'

const handlers: Handlers = {
  runner_externalStorageSet: async (context, params) => {
    const [blockHash, key, value] = params
    context.state.set(blockHash, key, value)
  },
  runner_externalStorageGet: async (context, params) => {
    const [blockHash, key] = params
    return context.state.get(blockHash, key)
  },
}

export default handlers
