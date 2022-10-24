import { WebSocket } from 'ws'
// @ts-ignore
global.WebSocket = WebSocket;

import { defaultLogger } from './logger'
import { start } from '../executor/pkg'

const logger = defaultLogger.child({ name: 'task' })

interface Task {
  kind: 'Call' | 'RuntimeVersion'
  blockHash: string
  wasm?: string
  calls?: [string, string][]
}

export class TaskManager {
  #tasks: { task: Task; callback: (res: any) => any }[] = []
  #listeningPort: number

  constructor(listeningPort: number) {
    this.#listeningPort = listeningPort
  }

  updateListeningPort(port: number) {
    this.#listeningPort = port
  }

  addTask(task: Task, callback: (res: any) => any = () => {}) {
    logger.debug(
      {
        kind: task.kind,
      },
      'AddTask'
    )

    this.#tasks.push({ task, callback })
    return this.#tasks.length - 1
  }

  getTask(taskId: number) {
    return this.#tasks[taskId]
  }

  runTask(taskId: number): Promise<void> {
    return start(taskId, `ws://localhost:${this.#listeningPort}`)
  }

  async addAndRunTask(task: Task, callback: (res: any) => any = () => {}) {
    const taskId = this.addTask(task, callback)
    await this.runTask(taskId)
  }
}
