import { Blockchain } from '../blockchain'
import { connectDownward } from './downward'
import { connectHorizontal } from './horizontal'
import { connectUpward } from './upward'
import { defaultLogger } from '../logger'
import { getParaId } from '../utils'

export const logger = defaultLogger.child({ name: 'xcm' })

export const connectVertical = async (relaychain: Blockchain, parachain: Blockchain) => {
  await connectDownward(relaychain, parachain)
  await connectUpward(parachain, relaychain)
  logger.info(
    `Connected relaychain '${await relaychain.api.getSystemChain()}' with parachain '${await parachain.api.getSystemChain()}'`
  )
}

export const connectParachains = async (parachains: Blockchain[]) => {
  const list: Record<number, Blockchain> = {}

  for (const chain of parachains) {
    const paraId = await getParaId(chain)
    list[paraId.toNumber()] = chain
  }

  await connectHorizontal(list)

  logger.info(`Connected parachains [${Object.keys(list)}]`)
}
