import { HexString } from '@polkadot/util/types'
import { WebSocket } from 'ws'
import { hexToString, hexToU8a } from '@polkadot/util'
global.WebSocket = WebSocket

import { compactHex } from './utils'
import { get_metadata, get_runtime_version, run_task } from '../executor/pkg'

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

export { run_task as runTask }
