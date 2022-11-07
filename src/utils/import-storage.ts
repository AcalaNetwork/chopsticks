import { existsSync, readFileSync } from 'fs'
import yaml from 'js-yaml'

import { Blockchain } from '../blockchain'
import { defaultLogger } from '../logger'
import { setStorage } from './set-storage'

export const importStorage = async (storage: any, chain: Blockchain) => {
  let storageValue
  if (storage == null) {
    return
  }
  if (typeof storage === 'string') {
    if (!existsSync(storage)) throw Error(`File ${storage} does not exist`)
    storageValue = yaml.load(String(readFileSync(storage)))
  } else {
    storageValue = storage
  }
  const blockHash = await setStorage(chain, storageValue)
  defaultLogger.trace({ blockHash, storage }, 'ImportStorage')
}

export const overrideWasm = async (wasmPath: string, chain: Blockchain) => {
  if (wasmPath == null) {
    return
  }
  const wasm = readFileSync(wasmPath)
  let wasmHex: string
  if (wasm.at(0) === 0x30 && wasm.at(1) === 0x78) {
    // starts with 0x
    wasmHex = wasm.toString()
  } else {
    wasmHex = '0x' + wasm.toString('hex')
  }
  chain.head.setWasm(wasmHex)
}
