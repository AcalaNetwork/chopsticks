import { Blockchain, StorageValues, setStorage } from '@acala-network/chopsticks-core'
import { HexString } from '@polkadot/util/types'
import { existsSync, readFileSync } from 'node:fs'
import yaml from 'js-yaml'

import { defaultLogger } from '../logger.js'

export const overrideStorage = async (chain: Blockchain, storage?: string | StorageValues, at?: HexString) => {
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
  const blockHash = await setStorage(chain, storageValue, at)
  defaultLogger.trace({ blockHash, storage }, 'OverrideStorage')
}

export const overrideWasm = async (chain: Blockchain, wasmPath?: string, at?: HexString) => {
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
  if (at) {
    const block = await chain.getBlock(at)
    if (!block) throw new Error(`Cannot find block ${at}`)
    block.setWasm(wasmHex as HexString)
  } else {
    chain.head.setWasm(wasmHex as HexString)
  }
}
