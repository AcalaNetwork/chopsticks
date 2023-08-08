import { expect, test } from '@playwright/test'

test('build blocks successfully', async ({ page }) => {
  test.setTimeout(5 * 60 * 1000) // 5 minutes timeout

  page.on('console', console.log)

  await page.goto('/')
  await page.waitForLoadState()

  // starts with Loading...
  await expect(page.locator('div#app')).toHaveText(/Loading.../)

  // chain is ready
  await expect(page.locator('div#app')).toHaveText(/4000000/, { timeout: 60_000 })

  // wait for new block
  await expect(page.locator('div#app')).toHaveText(/4000001/, { timeout: 200_000 })
})
