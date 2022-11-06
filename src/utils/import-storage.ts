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
