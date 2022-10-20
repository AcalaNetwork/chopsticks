import { Handlers, ResponseError } from './shared'
import { fetchKeysToArray } from '../utils'

const handlers: Handlers = {
  exec_storageGet: async (context, [_task_id, blockHash, key]) => {
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
