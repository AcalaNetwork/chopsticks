/// <reference types="vite/client" />

import { Blockchain } from '@acala-network/chopsticks-core'

declare global {
  // eslint-disable-next-line no-var
  var chain: Blockchain
}
