import * as AuthorRPC from './author.js'
import * as ChainRPC from './chain.js'
import * as PaymentRPC from './payment.js'
import * as StateRPC from './state.js'
import * as SystemRPC from './system.js'

export { AuthorRPC }
export { ChainRPC }
export { PaymentRPC }
export { StateRPC }
export { SystemRPC }

const handlers = {
  ...AuthorRPC,
  ...ChainRPC,
  ...PaymentRPC,
  ...StateRPC,
  ...SystemRPC,
}

export default handlers
