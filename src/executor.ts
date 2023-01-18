import { HexString } from '@polkadot/util/types'
import {
  compactAddLength,
  compactToU8a,
  hexToString,
  hexToU8a,
  u8aConcat,
  u8aConcatStrict,
  u8aToHex,
} from '@polkadot/util'

import { Block } from './blockchain/block'
import { Registry } from '@polkadot/types-codec/types'
import {
  calculate_state_root,
  create_proof,
  decode_proof,
  get_runtime_version,
  run_task,
} from '@acala-network/chopsticks-executor'
import { defaultLogger, truncate } from './logger'
import _ from 'lodash'

interface JsCallback {
  getStorage: (key: HexString) => Promise<string | undefined>
  getPrefixKeys: (key: HexString) => Promise<string[]>
  getNextKey: (key: HexString) => Promise<string | undefined>
}

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

const logger = defaultLogger.child({ name: 'executor' })

export const getRuntimeVersion = async (code: HexString): Promise<RuntimeVersion> => {
  return get_runtime_version(code).then((version) => {
    version.specName = hexToString(version.specName)
    version.implName = hexToString(version.implName)
    return version
  })
}

export const calculateStateRoot = async (entries: [HexString, HexString][]): Promise<HexString> => {
  return calculate_state_root(entries)
}

const nodesAddLength = (nodes: HexString[]): HexString => {
  const nodesWithLength = nodes.map((x) => compactAddLength(hexToU8a(x)))
  return u8aToHex(u8aConcatStrict([compactToU8a(nodesWithLength.length), u8aConcat(...nodesWithLength)]))
}

export const decodeProof = async (trieRootHash: HexString, keys: HexString[], nodes: HexString[]) => {
  const decoded: [HexString, HexString | null][] = await decode_proof(trieRootHash, keys, nodesAddLength(nodes))
  return decoded.reduce((accum, [key, value]) => {
    accum[key] = value
    return accum
  }, {} as Record<HexString, HexString | null>)
}

export const createProof = async (
  trieRootHash: HexString,
  nodes: HexString[],
  entries: [HexString, HexString | null][]
) => {
  const result = await create_proof(trieRootHash, nodesAddLength(nodes), entries)
  return { trieRootHash: result[0] as HexString, nodes: result[1] as HexString[] }
}

export const runTask = async (
  task: {
    wasm: HexString
    calls: [string, HexString][]
    storage: [HexString, HexString | null][]
    mockSignatureHost: boolean
    allowUnresolvedImports: boolean
  },
  callback: JsCallback = emptyTaskHandler
) => {
  logger.trace(truncate(task), 'taskRun')
  const response = await run_task(task, callback)
  if (response.Call) {
    logger.trace(truncate(response.Call), 'taskResponse')
  } else {
    logger.trace({ response }, 'taskResponse')
  }
  return response
}

export const taskHandler = (block: Block): JsCallback => {
  return {
    getStorage: async function (key: HexString) {
      return block.get(key)
    },
    getPrefixKeys: async function (key: HexString) {
      return block.getKeysPaged({ prefix: key, pageSize: 1000, startKey: key })
    },
    getNextKey: async function (key: HexString) {
      const keys = await block.getKeysPaged({ prefix: '0x', pageSize: 1, startKey: key })
      return keys[0]
    },
  }
}

export const emptyTaskHandler = {
  getStorage: async function (_key: HexString) {
    throw new Error('Method not implemented')
  },
  getPrefixKeys: async function (_key: HexString) {
    throw new Error('Method not implemented')
  },
  getNextKey: async function (_key: HexString) {
    throw new Error('Method not implemented')
  },
}

export const getAuraSlotDuration = _.memoize(async (wasm: HexString, registry: Registry): Promise<number> => {
  const result = await runTask({
    wasm,
    calls: [['AuraApi_slot_duration', '0x']],
    storage: [],
    mockSignatureHost: false,
    allowUnresolvedImports: false,
  })

  if (!result.Call) throw new Error(result.Error)
  const slotDuration = registry.createType('u64', hexToU8a(result.Call.result)).toNumber()
  return slotDuration
})
