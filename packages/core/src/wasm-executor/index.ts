import type { JsCallback } from '@acala-network/chopsticks-executor'
import { hexToString, hexToU8a, u8aToBn } from '@polkadot/util'
import type { HexString } from '@polkadot/util/types'
import { randomAsHex } from '@polkadot/util-crypto'
import * as Comlink from 'comlink'
import _ from 'lodash'
import type { Block } from '../blockchain/block.js'
import { defaultLogger, truncate } from '../logger.js'
import { PREFIX_LENGTH, stripChildPrefix } from '../utils/index.js'
export type { JsCallback }

export type RuntimeVersion = {
  specName: string
  implName: string
  authoringVersion: number
  specVersion: number
  implVersion: number
  apis: [HexString, number][]
  transactionVersion: number
  stateVersion: number
}

export type TaskCall = {
  wasm: HexString
  calls: [string, HexString[]][]
  mockSignatureHost: boolean
  allowUnresolvedImports: boolean
  runtimeLogLevel: number
  storageProofSize?: number
}

export type RuntimeLog = {
  message: string
  level?: number
  target?: string
}

export type TaskCallResponse = {
  result: HexString
  storageDiff: [HexString, HexString | null][]
  offchainStorageDiff: [HexString, HexString | null][]
  runtimeLogs: RuntimeLog[]
}

export type TaskResponse =
  | {
      Call: TaskCallResponse
    }
  | {
      Error: string
    }

export interface WasmExecutor {
  getRuntimeVersion: (code: HexString) => Promise<RuntimeVersion>
  calculateStateRoot: (entries: [HexString, HexString][], trie_version: number) => Promise<HexString>
  createProof: (nodes: HexString[], updates: [HexString, HexString | null][]) => Promise<[HexString, HexString[]]>
  decodeProof: (trieRootHash: HexString, nodes: HexString[]) => Promise<[[HexString, HexString]]>
  runTask: (
    task: {
      wasm: HexString
      calls: [string, HexString[]][]
      mockSignatureHost: boolean
      allowUnresolvedImports: boolean
      runtimeLogLevel: number
    },
    callback?: JsCallback,
  ) => Promise<TaskResponse>
  testing: (callback: JsCallback, key: any) => Promise<any>
}

const logger = defaultLogger.child({ name: 'executor' })

let __executor_worker: Promise<{ remote: Comlink.Remote<WasmExecutor>; terminate: () => Promise<void> }> | undefined
export const getWorker = async () => {
  if (__executor_worker) return __executor_worker

  const isNode = typeof process !== 'undefined' && process?.versions?.node // true for node or bun

  if (isNode) {
    __executor_worker = import('./node-worker.js').then(({ startWorker }) => startWorker())
  } else {
    __executor_worker = import('./browser-worker.js').then(({ startWorker }) => startWorker())
  }
  return __executor_worker
}

export const getRuntimeVersion = _.memoize(async (code: HexString): Promise<RuntimeVersion> => {
  const worker = await getWorker()
  return worker.remote.getRuntimeVersion(code).then((version) => {
    version.specName = hexToString(version.specName)
    version.implName = hexToString(version.implName)
    return version
  })
})

// trie_version: 0 for old trie, 1 for new trie
export const calculateStateRoot = async (
  entries: [HexString, HexString][],
  trie_version: number,
): Promise<HexString> => {
  const worker = await getWorker()
  return worker.remote.calculateStateRoot(entries, trie_version)
}

export const decodeProof = async (trieRootHash: HexString, nodes: HexString[]) => {
  const worker = await getWorker()
  const result = await worker.remote.decodeProof(trieRootHash, nodes)
  return result.reduce(
    (accum, [key, value]) => {
      accum[key] = value
      return accum
    },
    {} as { [key: HexString]: HexString },
  )
}

export const createProof = async (nodes: HexString[], updates: [HexString, HexString | null][]) => {
  const worker = await getWorker()
  const [trieRootHash, newNodes] = await worker.remote.createProof(nodes, updates)
  return { trieRootHash, nodes: newNodes }
}

let nextTaskId = 0

export const runTask = async (task: TaskCall, callback: JsCallback = emptyTaskHandler) => {
  const taskId = nextTaskId++
  const task2 = {
    ...task,
    id: taskId,
    storageProofSize: task.storageProofSize ?? 0,
  }
  const worker = await getWorker()
  logger.trace(truncate(task2), `runTask #${taskId}`)

  const response = await worker.remote.runTask(task2, Comlink.proxy(callback))
  if ('Call' in response) {
    logger.trace(truncate(response.Call), `taskResponse #${taskId}`)
  } else {
    logger.trace({ response }, `taskResponse ${taskId}`)
  }
  return response
}

export const taskHandler = (block: Block): JsCallback => {
  return {
    getStorage: async (key: HexString) => block.get(key),
    getNextKey: async (prefix: HexString, key: HexString) => {
      const [nextKey] = await block.getKeysPaged({
        prefix: prefix.length === 2 /** 0x */ ? key.slice(0, PREFIX_LENGTH) : prefix,
        pageSize: 1,
        startKey: key,
      })
      return nextKey && stripChildPrefix(nextKey as HexString)
    },
    offchainGetStorage: async (key: HexString) => {
      if (!block.chain.offchainWorker) throw new Error('offchain worker not found')
      return block.chain.offchainWorker.get(key) as string
    },
    offchainTimestamp: async () => Date.now(),
    offchainRandomSeed: async () => randomAsHex(32),
    offchainSubmitTransaction: async (tx: HexString) => {
      if (!block.chain.offchainWorker) throw new Error('offchain worker not found')
      try {
        const hash = await block.chain.offchainWorker.pushExtrinsic(block, tx)
        logger.trace({ hash }, 'offchainSubmitTransaction')
        return true
      } catch (error) {
        logger.trace({ error }, 'offchainSubmitTransaction')
        return false
      }
    },
  }
}

export const emptyTaskHandler = {
  getStorage: async (_key: HexString) => {
    throw new Error('Method not implemented')
  },
  getNextKey: async (_prefix: HexString, _key: HexString) => {
    throw new Error('Method not implemented')
  },
  offchainGetStorage: async (_key: HexString) => {
    throw new Error('Method not implemented')
  },
  offchainTimestamp: async () => {
    throw new Error('Method not implemented')
  },
  offchainRandomSeed: async () => {
    throw new Error('Method not implemented')
  },
  offchainSubmitTransaction: async (_tx: HexString) => {
    throw new Error('Method not implemented')
  },
}

export const getAuraSlotDuration = _.memoize(async (wasm: HexString): Promise<number> => {
  const result = await runTask({
    wasm,
    calls: [['AuraApi_slot_duration', []]],
    mockSignatureHost: false,
    allowUnresolvedImports: false,
    runtimeLogLevel: 0,
  })

  if ('Error' in result) throw new Error(result.Error)
  return u8aToBn(hexToU8a(result.Call.result).subarray(0, 8 /* u64: 8 bytes */)).toNumber()
})

export const getSpinSlotDuration = _.memoize(async (wasm: HexString): Promise<number> => {
  const result = await runTask({
    wasm,
    calls: [['SpinApi_slot_duration', []]],
    mockSignatureHost: false,
    allowUnresolvedImports: false,
    runtimeLogLevel: 0,
  })

  if ('Error' in result) throw new Error(result.Error)
  return u8aToBn(hexToU8a(result.Call.result).subarray(0, 8 /* u64: 8 bytes */)).toNumber()
})

export const destroyWorker = async () => {
  if (!__executor_worker) return
  const executor = await __executor_worker
  executor.remote[Comlink.releaseProxy]()
  await new Promise((resolve) => setTimeout(resolve, 50))
  await executor.terminate()
  __executor_worker = undefined
}
