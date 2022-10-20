import { Handlers, ResponseError } from './shared'
import { defaultLogger } from '../logger'
import { fetchKeysToArray } from '../utils'

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
    const res = await fetchKeysToArray((startKey) => context.api.rpc.state.getKeysPaged(key, 500, startKey, blockHash))
    return res.map((k) => k.toHex())
  },
  exec_nextKey: async (context, [_task_id, blockHash, key]) => {
    const res = await context.api.rpc.state.getKeysPaged(key, 1, null, blockHash)
    return res[0]?.toHex()
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
