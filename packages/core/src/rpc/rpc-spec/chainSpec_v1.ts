import type { HexString } from '@polkadot/util/types'
import type { ChainProperties } from '../../index.js'
import { type Handler, ResponseError } from '../shared.js'

export const chainSpec_v1_chainName: Handler<[], string> = async (context) => {
  return context.chain.api.getSystemChain()
}

export const chainSpec_v1_genesisHash: Handler<[], HexString> = async (context) => {
  const genesisHash = await context.chain.api.getBlockHash(0)
  if (genesisHash === null) {
    throw new ResponseError(1, 'Unexpected null genesis hash')
  }
  return genesisHash
}

export const chainSpec_v1_properties: Handler<[], ChainProperties> = async (context) => {
  return context.chain.api.getSystemProperties()
}
