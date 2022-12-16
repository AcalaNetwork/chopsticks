import { HexString } from '@polkadot/util/types'
import { WebSocket } from 'ws'
import {
  compactAddLength,
  compactToU8a,
  hexToString,
  hexToU8a,
  u8aConcat,
  u8aConcatStrict,
  u8aToHex,
} from '@polkadot/util'
global.WebSocket = WebSocket

import {
  calculate_state_root,
  create_proof,
  decode_proof,
  get_metadata,
  get_runtime_version,
  run_task,
} from '../executor/pkg'
import { compactHex } from './utils'
import { defaultLogger } from './logger'

const logger = defaultLogger.child({ name: 'executor' })

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

export const getRuntimeVersion = async (code: HexString): Promise<RuntimeVersion> => {
  return get_runtime_version(code).then((version) => {
    version.specName = hexToString(version.specName)
    version.implName = hexToString(version.implName)
    return version
  })
}

export const getMetadata = async (code: HexString): Promise<HexString> => {
  return compactHex(hexToU8a(await get_metadata(code)))
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

export const createProof = async (trieRootHash: HexString, nodes: HexString[], entries: [HexString, HexString][]) => {
  const result = await create_proof(trieRootHash, nodesAddLength(nodes), entries)
  return { trieRootHash: result[0] as HexString, nodes: result[1] as HexString[] }
}

export const runTask = async (task: {
  blockHash: HexString
  wasm: HexString
  calls: [string, HexString][]
  mockSignatureHost: boolean
  allowUnresolvedImports: boolean
}) => {
  logger.trace({ task }, 'taskRun')
  const response = await run_task(task)
  logger.trace({ response }, 'taskResponse')
  return response
}
