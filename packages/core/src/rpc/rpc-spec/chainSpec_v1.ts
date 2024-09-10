import { ChainProperties } from '../../index.js'
import { Handler } from '../shared.js'

export const chainSpec_v1_chainName: Handler<[], string> = async (context) => {
  return context.chain.api.getSystemChain()
}

export const chainSpec_v1_genesisHash: Handler<[], string> = async (context) => {
  return (await context.chain.api.getBlockHash(0)) ?? ''
}

export const chainSpec_v1_properties: Handler<[], ChainProperties> = async (context) => {
  return context.chain.api.getSystemProperties()
}
