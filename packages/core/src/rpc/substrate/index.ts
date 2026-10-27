import * as ArchiveRPC from './archive.js'
import * as AuthorRPC from './author.js'
import * as ChainRPC from './chain.js'
import * as EthRPC from './eth.js'
import * as PaymentRPC from './payment.js'
import * as StateRPC from './state.js'
import * as SystemRPC from './system.js'

export { ArchiveRPC }
export { AuthorRPC }
export { ChainRPC }
export { EthRPC }
export { PaymentRPC }
export { StateRPC }
export { SystemRPC }

const handlers = {
  ...ArchiveRPC,
  ...AuthorRPC,
  ...ChainRPC,
  ...EthRPC,
  ...PaymentRPC,
  ...StateRPC,
  ...SystemRPC,
}

export default handlers
