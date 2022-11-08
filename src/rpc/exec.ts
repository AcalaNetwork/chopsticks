import { Handlers, ResponseError } from './shared'
import { defaultLogger, truncate } from '../logger'

const logger = defaultLogger.child({ name: 'rpc-exec' })

const handlers: Handlers = {
  exec_storageGet: async (context, [_taskId, blockHash, key]) => {
    const block = await context.chain.getBlock(blockHash)
    if (!block) {
      throw new ResponseError(1, `Block not found ${blockHash}`)
    }
    const value = await block.get(key)

    logger.trace({ blockHash, key, value: truncate(value) }, 'exec_storageGet')

    return value
  },
  exec_prefixKeys: async (context, [_taskId, blockHash, key]) => {
    const block = await context.chain.getBlock(blockHash)
    if (!block) {
      throw new ResponseError(1, `Block not found ${blockHash}`)
    }
    return block.getKeysPaged({ prefix: key, pageSize: 1000, startKey: key })
  },
  exec_nextKey: async (context, [_taskId, blockHash, key]) => {
    const block = await context.chain.getBlock(blockHash)
    if (!block) {
      throw new ResponseError(1, `Block not found ${blockHash}`)
    }
    const res = await block.getKeysPaged({ prefix: key, pageSize: 1, startKey: key })
    return res[0] || null
  },
  exec_getTask: async (context, [taskId]) => {
    logger.trace({ taskId }, 'exec_getTask')

    const task = context.tasks.getTask(Number(taskId))
    if (!task) {
      throw new ResponseError(1, `Task not found ${taskId}`)
    }
    return task.task
  },
  exec_taskResult: async (context, [taskId, resp]) => {
    logger.trace({ taskId }, 'exec_taskResult')
    context.tasks.getTask(Number(taskId))?.callback(resp)
  },
}

export default handlers
