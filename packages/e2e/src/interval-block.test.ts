import { afterAll, describe, expect, it } from 'vitest'

import { BuildBlockMode } from '@acala-network/chopsticks'
import { delay } from './helper'
import networks from './networks'

describe('interval block', async () => {
  const acala = await networks.acala({ buildBlockMode: BuildBlockMode.Interval })
  const { chain, dev } = acala

  afterAll(async () => {
    await acala.teardown()
  })

  it('interval new block works', async () => {
    const sourceBlockNumber = chain.head.number
    await delay(120000)
    const finalBlockNumber = chain.head.number
    expect(finalBlockNumber).toBeGreaterThan(sourceBlockNumber)

  })
})
