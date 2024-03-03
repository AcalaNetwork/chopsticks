import { Context, ResponseError } from '../shared.js'
import { timeTravel } from '../../utils/time-travel.js'

/**
 * Travel to a specific time.
 *
 * This function is a dev rpc handler. Use `dev_timeTravel` as the method name when calling it.
 *
 * @param context - The context object of the rpc handler
 * @param date - Timestamp or date string to set
 *
 * @example
 * ```ts
 * import { WsProvider } from '@polkadot/rpc-provider'
 * const ws = new WsProvider(`ws://localhost:8000`)
 * await ws.send('dev_timeTravel', ['Jan 1, 2023'])
 * ```
 */
export const dev_timeTravel = async (context: Context, [date]: [string | number]) => {
  const timestamp = typeof date === 'string' ? Date.parse(date) : date
  if (Number.isNaN(timestamp)) throw new ResponseError(1, 'Invalid date')
  await timeTravel(context.chain, timestamp)
  return timestamp
}
