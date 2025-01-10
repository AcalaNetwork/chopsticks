/// <reference types="vite/client" />

import type { Blockchain } from '@acala-network/chopsticks-core'
import type { ApiPromise } from '@polkadot/api'

declare global {
  // eslint-disable-next-line no-var
  var chain: Blockchain
  // eslint-disable-next-line no-var
  var api: ApiPromise
}
