import { expect, test } from '@playwright/test'

test.describe('chopsticks provider', async () => {
  test.beforeEach(async ({ page }) => {
    // Go to the starting url before each test.
    page.on('console', async (msg) => {
      const args = await Promise.all(msg.args().map((arg) => arg.jsonValue()))
      console.log(...args)
    })
    await page.goto('/')
    await page.waitForLoadState()
  })

  test('chopsticks provider send transaction', async ({ page }) => {
    test.setTimeout(5 * 60 * 1000) // 5 minutes timeout
    // chain is ready
    await expect(page.locator('#blocks-section')).toHaveText(/4000000/, { timeout: 60_000 })

    await page.getByText('Alice transfer 1000 to Bob').click()
    await expect(page.locator('#chopsticks-provider')).toHaveText(/1000000001000/, { timeout: 200_000 })
  })
})
