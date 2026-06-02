import type { HexString } from '@polkadot/util/types'

import { buildReadProof } from '../read-proof.js'
import type { Handler } from '../shared.js'

/**
 * @param context
 * @param params - [`keys`, `blockhash?`]
 *
 * @return `{ at, proof, stateRoot }`
 *
 * Chopsticks-specific variant of `state_getReadProof` that also returns `stateRoot` — the
 * root the composed proof verifies against, which verifiers must check instead of the header
 * state root (see `buildReadProof`). Kept out of the spec method so it stays `{ at, proof }`.
 */
export const dev_getReadProof: Handler<
  [HexString[], HexString | undefined],
  { at: HexString; proof: HexString[]; stateRoot: HexString }
> = async (context, [keys, hash]) => buildReadProof(context, keys, hash)
