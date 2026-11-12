import * as ArchiveRPC from './archive.js'
import * as AuthorRPC from './author.js'
import * as ChainRPC from './chain.js'
import * as PaymentRPC from './payment.js'
import * as StateRPC from './state.js'
import * as SystemRPC from './system.js'

export { ArchiveRPC, AuthorRPC, ChainRPC, PaymentRPC, StateRPC, SystemRPC }

const handlers = {
  ...ArchiveRPC,
  ...AuthorRPC,
  ...ChainRPC,
  ...PaymentRPC,
  ...StateRPC,
  ...SystemRPC,
}

export default handlers
