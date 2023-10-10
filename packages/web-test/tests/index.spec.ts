import { expect, test } from '@playwright/test'

test.describe('index', () => {
  test.beforeEach(async ({ page }) => {
    // Go to the starting url before each test.
    page.on('console', async (msg) => {
      const args = await Promise.all(msg.args().map((arg) => arg.jsonValue()))
      console.log(...args)
    })
    await page.goto('/')
    await page.waitForLoadState()
  })

  test('build blocks successfully', async ({ page }) => {
    test.setTimeout(5 * 60 * 1000) // 5 minutes timeout
    // starts with Loading...
    await expect(page.getByText('Save')).toBeDisabled()
    // chain is ready
    await expect(page.locator('#blocks-section')).toHaveText(/4000000/, { timeout: 60_000 })
    // wait for new block
    await expect(page.locator('#blocks-section')).toHaveText(/4000001/, { timeout: 200_000 })
  })

  test('dry run extrinsics', async ({ page }) => {
    test.setTimeout(5 * 60 * 1000)
    const button = page.getByText(/dry run call/i)
    await button.isEnabled({ timeout: 60_000 })
    await button.click()
    await expect(page.getByText('Loading dry run result...')).toBeVisible()
    await expect(page.locator('#extrinsic-section')).toHaveText(/outcome/, { timeout: 60_000 })
  })
})
