import * as AuthorRPC from './author'
import * as ChainRPC from './chain'
import * as PaymentRPC from './payment'
import * as StateRPC from './state'
import * as SystemRPC from './system'

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
