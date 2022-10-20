import { Handlers, randomId } from '../shared'

const handlers: Handlers = {
  state_getRuntimeVersion: async (context) => {
    return context.api.rpc.state.getRuntimeVersion()
  },
  state_getMetadata: async (context) => {
    return context.api.rpc.state.getMetadata()
  },
  state_subscribeRuntimeVersion: async (context, _params, { subscribe }) => {
    const id = randomId()
    const callback = subscribe(id)
    context.tasks.addAndRunTask(
      {
        kind: 'RuntimeVersion',
        blockHash: context.chain.head.hash,
        wasm: await context.chain.head.wasm,
      },
      (resp) => {
        const ver = resp['RuntimeVersion']
        const decoded = context.api.createType('RuntimeVersion', ver)
        callback(decoded.toJSON())
      }
    )
    return id
  },
  state_unsubscribeRuntimeVersion: async (_context, params, { unsubscribe }) => {
    const [subid] = params
    unsubscribe(subid)
  },
}

export default handlers
