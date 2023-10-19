import '@polkadot/api-augment'
import { createTestPairs } from '@polkadot/keyring'
import { expect, test } from '@playwright/test'

test.describe('chopsticks provider', async () => {
  const { alice, bob } = createTestPairs()

  test.beforeEach(async ({ page }) => {
    // Go to the starting url before each test.
    page.on('console', async (msg) => {
      const args = await Promise.all(msg.args().map((arg) => arg.jsonValue()))
      console.log(...args)
    })
    await page.goto('/')
    await page.waitForLoadState()
  })

  test('handles tx', async ({ page }) => {
    test.setTimeout(5 * 60 * 1000) // 5 minutes timeout
    // chain is ready
    await expect(page.locator('#blocks-section')).toHaveText(/4000000/, { timeout: 60_000 })
    const chain = await page.evaluate(() => window['chain'])
    const api = await page.evaluate(() => window['api'])

    await api.tx.balances.transfer(bob.address, 1000).signAndSend(alice)
    await chain.upcomingBlocks()
    const bobAccount = await api.query.system.account(bob.address)
    expect(bobAccount.data.free.toHuman()).toBe(`${1 * 1e12 + 1000}`)
  })
})
