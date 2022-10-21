import { Handlers } from '../shared'

const handlers: Handlers = {
  author_submitExtrinsic: async (context, [extrinsic]) => {
    return context.chain.submitExtrinsic(extrinsic)
  },
  author_submitAndWatchExtrinsic: async (context, [extrinsic]) => {
    return context.chain.submitExtrinsic(extrinsic)
  },
}

export default handlers
