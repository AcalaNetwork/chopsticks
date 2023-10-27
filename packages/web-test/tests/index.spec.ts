import { HexString } from '@polkadot/util/types'
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
    await page.getByText(/build block/i).click()
    // wait for new block
    await expect(page.locator('#blocks-section')).toHaveText(/4000001/, { timeout: 200_000 })
    // check indexedDB
    const savedHash = await page.evaluate(async () => {
      const db = window.indexedDB.open('cache', 1)
      await new Promise((resolve) => {
        db.onsuccess = resolve
      })
      const tx = db.result.transaction('block', 'readonly')
      const store = tx.objectStore('block')
      const block = store.index('byNumber').get(4000001)
      await new Promise((resolve) => {
        block.onsuccess = resolve
      })
      return block.result.hash
    })
    expect(savedHash).toBe('0x6b81a9a7fabbe32c1e685b944c8f1afd06be7e58ae48bb8d5ac50cc761d9bb77')
  })

  test('dry run extrinsic', async ({ page }) => {
    test.setTimeout(5 * 60 * 1000) // 5 minutes timeout
    // chain is ready
    await expect(page.locator('#blocks-section')).toHaveText(/4000000/, { timeout: 60_000 })
    await page.getByText(/dry run call/i).click()
    await expect(page.getByText('Loading dry run result...')).toBeVisible()
    await expect(page.locator('#extrinsic-section')).toHaveText(/outcome/, { timeout: 200_000 })
  })

  test('chain indexedDB works', async ({ page }) => {
    test.setTimeout(5 * 60 * 1000) // 5 minutes timeout
    // chain is ready
    await expect(page.locator('#blocks-section')).toHaveText(/4000000/, { timeout: 60_000 })
    await page.getByText(/build block/i).click()
    // wait for new block
    await expect(page.locator('#blocks-section')).toHaveText(/4000001/, { timeout: 200_000 })

    // test db methods
    const hightestBlock = await page.evaluate(() => globalThis.chain.db?.queryHighestBlock())
    expect(hightestBlock?.number).toBe(4_000_001)
    const blockByNumber = await page.evaluate(() => globalThis.chain.db?.queryBlockByNumber(4_000_001))
    expect(blockByNumber).toBeDefined()
    expect(blockByNumber?.number).toBe(hightestBlock?.number)
    const blocksCount = await page.evaluate(() => globalThis.chain.db?.blocksCount())
    expect(blocksCount).toBe(1)

    await page.evaluate(
      (hightestBlock) => globalThis.chain.db?.deleteBlock(hightestBlock?.hash as HexString),
      hightestBlock,
    )
    const blocksCount2 = await page.evaluate(() => globalThis.chain.db?.blocksCount())
    expect(blocksCount2).toBe(0)

    const storage = await page.evaluate(
      (hightestBlock) => globalThis.chain.db?.queryStorage(hightestBlock?.hash as HexString, '0x'),
      hightestBlock,
    )
    expect(storage?.value).toBeNull()
  })
})
