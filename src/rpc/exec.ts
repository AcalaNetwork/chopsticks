import { Handlers, ResponseError } from './shared'
import { defaultLogger } from '../logger'

const logger = defaultLogger.child({ name: 'exec' })

const handlers: Handlers = {
  exec_storageGet: async (context, [_task_id, blockHash, key]) => {
    logger.trace({ blockHash, key }, 'exec_storageGet')

    const block = await context.chain.getBlock(blockHash)
    if (!block) {
      throw new ResponseError(1, 'Block not found')
    }
    const value = await block.get(key)
    return value
  },
  exec_prefixKeys: async (context, [_task_id, blockHash, key]) => {
    const block = await context.chain.getBlock(blockHash)
    if (!block) {
      throw new ResponseError(1, 'Block not found')
    }
    return block.getKeysPaged({ prefix: key, pageSize: 1000, startKey: key })
  },
  exec_nextKey: async (context, [_task_id, blockHash, key]) => {
    const block = await context.chain.getBlock(blockHash)
    if (!block) {
      throw new ResponseError(1, 'Block not found')
    }
    const res = await block.getKeysPaged({ prefix: key, pageSize: 1, startKey: key })
    return res[0] || null
  },
  exec_getTask: async (context, [task_id]) => {
    logger.trace({ task_id }, 'exec_getTask')

    const task = context.tasks.getTask(Number(task_id))
    if (!task) {
      throw new ResponseError(1, 'Task not found')
    }
    return task.task
  },
  exec_taskResult: async (context, [taskId, resp]) => {
    context.tasks.getTask(Number(taskId))?.callback(resp)
  },
}

export default handlers
