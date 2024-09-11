import * as ChainHeadV1RPC from './chainHead_v1.js'
import * as TransactionV1RPC from './transaction_v1.js'

export { ChainHeadV1RPC, TransactionV1RPC }

const handlers = {
  ...ChainHeadV1RPC,
  ...TransactionV1RPC,
}

export default handlers
