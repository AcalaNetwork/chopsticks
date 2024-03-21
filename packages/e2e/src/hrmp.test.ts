import { describe, it } from 'vitest'

import { HorizontalMessage } from '@acala-network/chopsticks-core/blockchain/txpool.js'

import { checkSystemEvents, setupContext } from './helper.js'

const statemineHRMP: Record<number, HorizontalMessage[]> = {
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
      data: '0x000210000400000106080001000fc2ddd331d55e200a1300000106080001000fc2ddd331d55e20010700f2052a010d01000400010100ba686c8fa59178c699a698ea4d8e2c595394c2594bce4b6c2ca3a9bf3018e25d',
      sentAt: 0, // doesn't matter. validate-data inherent will inject the relay chain block number
    },
  ],
}

describe('HRMP', () => {
  it('Statemine handles horizonal messages', async () => {
    const statemine = await setupContext({
      endpoint: 'wss://statemine-rpc-tn.dwellir.com',
      db: !process.env.RUN_TESTS_WITHOUT_DB ? 'e2e-tests-db.sqlite' : undefined,
    })
    await statemine.chain.newBlock({ horizontalMessages: statemineHRMP })
    await checkSystemEvents(statemine, 'xcmpQueue', 'Success').toMatchSnapshot()
    await statemine.teardown()
  })

  it('Acala handles horizonal messages', async () => {
    const acala = await setupContext({
      endpoint: 'wss://acala-rpc.aca-api.network',
      db: !process.env.RUN_TESTS_WITHOUT_DB ? 'e2e-tests-db.sqlite' : undefined,
    })
    await acala.chain.newBlock({ horizontalMessages: acalaHRMP })
    await checkSystemEvents(acala, 'messageQueue', 'Processed').toMatchSnapshot()
    await acala.teardown()
  })

  it('Statemine handles horizonal messages block#5,800,000', async () => {
    const statemine = await setupContext({
      endpoint: 'wss://statemine-rpc-tn.dwellir.com',
      blockNumber: 5_800_000,
      db: !process.env.RUN_TESTS_WITHOUT_DB ? 'e2e-tests-db.sqlite' : undefined,
    })
    await statemine.chain.newBlock({ horizontalMessages: statemineHRMP })
    await checkSystemEvents(statemine, 'xcmpQueue', 'Success').toMatchSnapshot()
    await statemine.teardown()
  })
})
