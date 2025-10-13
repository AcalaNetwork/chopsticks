import { expect, test } from '@playwright/test'
import type { HexString } from '@polkadot/util/types'

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
    expect(savedHash).toBe('0x7403a6c53702bfbace9737a5b3cc84fd02d5f8b30259e718455738ae841d992b')
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
    test.setTimeout(6 * 60 * 1000) // 6 minutes timeout
    // chain is ready
    await expect(page.locator('#blocks-section')).toHaveText(/4000000/, { timeout: 60_000 })
    await page.getByText(/build block/i).click()
    // wait for new block
    await expect(page.locator('#blocks-section')).toHaveText(/4000001/, { timeout: 200_000 })
    await page.getByText(/build block/i).click()
    // wait for new block
    await expect(page.locator('#blocks-section')).toHaveText(/4000002/, { timeout: 20_000 })

    // test db methods
    const hightestBlock = await page.evaluate(() => globalThis.chain.db?.queryHighestBlock())
    expect(hightestBlock).toEqual(
      expect.objectContaining({
        number: 4_000_002,
        hash: '0x9db1dc9525d7574ad6aed6b4302c9fb5069c5cd35288d97ebc78a58782f57b0d',
      }),
    )
    const blockByNumber = await page.evaluate(() => globalThis.chain.db?.queryBlockByNumber(4_000_001))
    expect(blockByNumber).toEqual(
      expect.objectContaining({
        number: 4_000_001,
        hash: '0x7403a6c53702bfbace9737a5b3cc84fd02d5f8b30259e718455738ae841d992b',
      }),
    )
    const blocksCount = await page.evaluate(() => globalThis.chain.db?.blocksCount())
    expect(blocksCount).toBe(2)
    await page.evaluate(
      (hightestBlock) => globalThis.chain.db?.deleteBlock(hightestBlock?.hash as HexString),
      hightestBlock,
    )
    // run test again after deleting hightest block
    {
      const blocksCount = await page.evaluate(() => globalThis.chain.db?.blocksCount())
      expect(blocksCount).toBe(1)
      const hightestBlock = await page.evaluate(() => globalThis.chain.db?.queryHighestBlock())
      expect(hightestBlock).toEqual(
        expect.objectContaining({
          number: 4_000_001,
          hash: '0x7403a6c53702bfbace9737a5b3cc84fd02d5f8b30259e718455738ae841d992b',
        }),
      )
    }

    // test storage
    {
      const storage = await page.evaluate(() => globalThis.chain.db?.queryStorage('0xaa', '0x01'))
      expect(storage).toBeNull()
    }
    {
      await page.evaluate(() => globalThis.chain.db?.saveStorage('0xaa', '0x01', null))
      const storage = await page.evaluate(() => globalThis.chain.db?.queryStorage('0xaa', '0x01'))
      expect(storage).toEqual({ blockHash: '0xaa', key: '0x01', value: null })
    }
    {
      await page.evaluate(() => globalThis.chain.db?.saveStorage('0xaa', '0x01', '0x01'))
      const storage = await page.evaluate(() => globalThis.chain.db?.queryStorage('0xaa', '0x01'))
      expect(storage).toEqual({ blockHash: '0xaa', key: '0x01', value: '0x01' })
    }
    {
      await page.evaluate(() => globalThis.chain.db?.saveStorage('0xbb', '0x02', '0x02'))
      const storage = await page.evaluate(() => globalThis.chain.db?.queryStorage('0xbb', '0x02'))
      expect(storage).toEqual({ blockHash: '0xbb', key: '0x02', value: '0x02' })
    }
    {
      const storage = await page.evaluate(() => globalThis.chain.db?.queryStorage('0xbb', '0x01'))
      expect(storage).toBeNull()
    }
  })
})
