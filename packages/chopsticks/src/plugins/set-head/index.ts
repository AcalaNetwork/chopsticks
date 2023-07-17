import { Block } from '../../blockchain/block'
import { Handler, ResponseError } from '../../rpc/shared'

export const rpc: Handler = async (context, [hashOrNumber]) => {
  let block: Block | undefined
  if (typeof hashOrNumber === 'number') {
    const blockNumber = hashOrNumber > 0 ? hashOrNumber : context.chain.head.number + hashOrNumber
    block = await context.chain.getBlockAt(blockNumber)
  } else {
    block = await context.chain.getBlock(hashOrNumber)
  }
  if (!block) {
    throw new ResponseError(1, `Block not found ${hashOrNumber}`)
  }
  await context.chain.setHead(block)
  return block.hash
}
