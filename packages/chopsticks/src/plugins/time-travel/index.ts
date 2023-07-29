import { Handler, ResponseError } from '../../rpc/shared'
import { timeTravel } from '@acala-network/chopsticks-core'

export const rpc: Handler = async (context, [date]) => {
  const timestamp = typeof date === 'string' ? Date.parse(date) : date
  if (Number.isNaN(timestamp)) throw new ResponseError(1, 'Invalid date')
  await timeTravel(context.chain, timestamp)
  return timestamp
}
