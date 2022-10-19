import { Handlers } from '../shared'

const handlers: Handlers = {
  state_getRuntimeVersion: async (context) => {
    return context.api.rpc.state.getRuntimeVersion()
  },
  state_getMetadata: async (context) => {
    return context.api.rpc.state.getMetadata()
  },
  state_subscribeRuntimeVersion: async (context, params, { subscribe }) => {
    let callback: (_: any) => void = () => {}
    const id = (
      await context.ws.subscribe('state_runtimeVersion', 'state_subscribeRuntimeVersion', params, (_err, res) => {
        console.log('state_subscribeRuntimeVersion', res)
        callback(res)
      })
    ).toString()
    callback = subscribe(id, () => {
      context.ws.unsubscribe('state_runtimeVersion', 'unsubscribeRuntimeVersion', id)
    })
    return id
  },
  state_unsubscribeRuntimeVersion: async (_context, params, { unsubscribe }) => {
    const [subid] = params
    unsubscribe(subid)
  },
}

export default handlers
