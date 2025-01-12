/// <reference types="vite/client" />

import type { Blockchain } from '@acala-network/chopsticks-core'
import type { ApiPromise } from '@polkadot/api'

declare global {
  var chain: Blockchain
  var api: ApiPromise
}
