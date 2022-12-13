import { HexString } from '@polkadot/util/types'
import { existsSync, readFileSync } from 'node:fs'
import yaml from 'js-yaml'

import { Blockchain } from '../blockchain'
import { StorageValues, setStorage } from './set-storage'
import { defaultLogger } from '../logger'

export const importStorage = async (chain: Blockchain, storage?: string | StorageValues) => {
  if (storage == null) {
    return
  }
  let storageValue: StorageValues
  if (typeof storage === 'string') {
    if (!existsSync(storage)) throw Error(`File ${storage} does not exist`)
    storageValue = yaml.load(String(readFileSync(storage))) as StorageValues
  } else {
    storageValue = storage
  }
  const blockHash = await setStorage(chain, storageValue)
  defaultLogger.trace({ blockHash, storage }, 'ImportStorage')
}

export const overrideWasm = async (chain: Blockchain, wasmPath?: string) => {
  if (wasmPath == null) {
    return
  }
  const wasm = readFileSync(wasmPath)
  let wasmHex: string
  if (wasm.at(0) === 0x30 && wasm.at(1) === 0x78) {
    // starts with 0x
    wasmHex = wasm.toString().trim()
  } else {
    wasmHex = '0x' + wasm.toString('hex')
  }
  chain.head.setWasm(wasmHex as HexString)
}
