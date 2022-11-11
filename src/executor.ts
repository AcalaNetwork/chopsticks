import { HexString } from '@polkadot/util/types'
import { WebSocket } from 'ws'
import { compactStripLength, hexToString, hexToU8a, u8aToHex } from '@polkadot/util'
global.WebSocket = WebSocket

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
  return u8aToHex(compactStripLength(hexToU8a(await get_metadata(code)))[1])
}

export { run_task as runTask }
