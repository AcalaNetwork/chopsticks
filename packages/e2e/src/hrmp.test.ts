import type { HorizontalMessage } from '@acala-network/chopsticks-core/blockchain/txpool.js'
import { describe, it } from 'vitest'

import { checkSystemEvents, setupContext } from './helper.js'

const statemineHRMP: Record<number, HorizontalMessage[]> = {
  2000: [
    {
      data: '0x00041000040002043205011f00c26d6fee0a130002043205011f00c26d6fee000d01020400010100fc39fcf04a8071b7409823b7c82427ce67910c6ed80aa0e5093aff234624c820',
      sentAt: 0, // doesn't matter. validate-data inherent will inject the relay chain block number
    },
  ],
}

const statemineHRMP_Legacy: Record<number, HorizontalMessage[]> = {
  2000: [
    {
      data: '0x0002100004000002043205011f0002093d000a13000002043205011f0002093d00000d0100040001010088dc3417d5058ec4b4503e0c12ea1a0a89be200fe98922423d4334014fa6b0ee',
      sentAt: 0, // doesn't matter. validate-data inherent will inject the relay chain block number
    },
  ],
}

const acalaHRMP: Record<number, HorizontalMessage[]> = {
  2004: [
    {
      data: '0x0004140104010200511f040a0017d44f44c22e417273640a13010200511f040a00172a90c463aab1c23932000d0102040001010034bfd7654f6407f134b4ed1c379430cfb99ffe878f2e6cd8a4da898783f9134e2c078fc91b1788fd2185bdf72050f7f78685c92164d21117c0797d9532e7de8522',
      sentAt: 0, // doesn't matter. validate-data inherent will inject the relay chain block number
    },
  ],
}

describe('HRMP', () => {
  it('Statemine handles horizonal messages', async () => {
    const statemine = await setupContext({
      endpoint: 'wss://statemine-rpc-tn.dwellir.com',
      db: !process.env.RUN_TESTS_WITHOUT_DB ? 'e2e-tests-db.sqlite' : undefined,
      blockNumber: 9_800_000,
    })
    await statemine.chain.newBlock({ horizontalMessages: statemineHRMP })
    await checkSystemEvents(statemine, 'messageQueue').toMatchSnapshot()
    await statemine.teardown()
  })

  it('Acala handles horizonal messages', async () => {
    const acala = await setupContext({
      endpoint: 'wss://acala-rpc.aca-api.network',
      db: !process.env.RUN_TESTS_WITHOUT_DB ? 'e2e-tests-db.sqlite' : undefined,
    })
    await acala.chain.newBlock({ horizontalMessages: acalaHRMP })
    await checkSystemEvents(acala, 'messageQueue').toMatchSnapshot()
    await acala.teardown()
  })

  it('Statemine handles horizonal messages block#5,800,000', async () => {
    const statemine = await setupContext({
      endpoint: 'wss://statemine-rpc-tn.dwellir.com',
      blockNumber: 5_800_000,
      db: !process.env.RUN_TESTS_WITHOUT_DB ? 'e2e-tests-db.sqlite' : undefined,
    })
    await statemine.chain.newBlock({ horizontalMessages: statemineHRMP_Legacy })
    await checkSystemEvents(statemine, 'xcmpQueue', 'Success').toMatchSnapshot()
    await statemine.teardown()
  })
})
