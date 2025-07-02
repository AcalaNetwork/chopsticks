import * as ArchiveV1RPC from './archive_v1.js'
import * as ChainHeadV1RPC from './chainHead_v1.js'
import * as ChainSpecV1RPC from './chainSpec_v1.js'
import * as TransactionV1RPC from './transaction_v1.js'

export { ChainHeadV1RPC, TransactionV1RPC, ChainSpecV1RPC }

const handlers = {
  ...ArchiveV1RPC,
  ...ChainHeadV1RPC,
  ...TransactionV1RPC,
  ...ChainSpecV1RPC,
}

export default handlers
