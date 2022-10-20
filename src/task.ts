import { spawn } from 'child_process'

import { defaultLogger } from './logger'

const logger = defaultLogger.child({ name: 'task' })

interface Task {
  kind: 'Call' | 'RuntimeVersion'
  blockHash: string
  wasm?: string
  calls?: [string, string][]
}

export class TaskManager {
  #tasks: { task: Task; callback: (res: any) => any }[] = []
  #executorCmd: string
  #listeningPort: number

  constructor(executorCmd: string, listeningPort: number) {
    this.#executorCmd = executorCmd
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
    const cmd = `${this.#executorCmd} --runner-url=ws://localhost:${this.#listeningPort} --task-id=${taskId}`
    logger.info({ taskId, cmd }, 'RunTask')
    const p = spawn(cmd, { shell: true, stdio: 'inherit' })

    return new Promise((resolve) => {
      p.once('exit', (code) => {
        logger.debug({ taskId, code }, 'RunTask done')
        resolve()
      })
    })
  }

  async addAndRunTask(task: Task, callback: (res: any) => any = () => {}) {
    const taskId = this.addTask(task, callback)
    await this.runTask(taskId)
  }
}
