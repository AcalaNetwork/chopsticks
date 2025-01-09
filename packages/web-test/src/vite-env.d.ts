/// <reference types="vite/client" />

import { Blockchain } from '@acala-network/chopsticks-core'
import { ApiPromise } from '@polkadot/api'

declare global {
  // eslint-disable-next-line no-var
  var chain: Blockchain
  // eslint-disable-next-line no-var
  var api: ApiPromise
}
