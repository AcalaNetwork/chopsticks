import { existsSync, readFileSync } from 'fs'
import yaml from 'js-yaml'

import { Blockchain } from '../blockchain'
import { defaultLogger } from '../logger'
import { setStorage } from './set-storage'

export const importStorage = async (storagePath: string, chain: Blockchain) => {
  if (!existsSync(storagePath)) throw Error(`File ${storagePath} does not exist`)
  const storage: any = yaml.load(String(readFileSync(storagePath)))
  const blockHash = await setStorage(chain, storage)
  defaultLogger.trace({ blockHash, storage }, 'ImportStorage')
}
