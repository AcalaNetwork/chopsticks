import { ApiPromise } from '@polkadot/api'
import { ChopsticksProvider, ChopsticksProviderProps } from '@acala-network/chopsticks-core'

// for console access of chopsticks provider
export const setupChopsticksApiPromise = async (props: ChopsticksProviderProps) => {
  try {
    const provider = new ChopsticksProvider(props)
    const api = new ApiPromise({
      provider,
    })
    globalThis.api = api
    await api.isReady
    return api
  } catch (e) {
    console.log(e)
  }
}
