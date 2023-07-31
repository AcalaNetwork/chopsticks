import { ChildProcessWithoutNullStreams, spawn } from 'node:child_process'
import { expect, test } from '@playwright/test'

const startServer = async (): Promise<ChildProcessWithoutNullStreams> => {
  console.log('Starting server...')
  return new Promise((resolve, reject) => {
    const server = spawn('yarn', ['vite:serve'])
    server.stderr.on('data', () => {
      reject()
    })
    server.stdout.on('data', (data) => {
      if (data.toString().includes('Local')) {
        console.log('Server started')
        resolve(server)
      }
    })
  })
}

test('build blocks successfully', async ({ page }) => {
  const process = await startServer()
  console.log('Running tests...')

  await page.goto('http://localhost:3000')

  test.slow()

  // starts with Loading...
  await expect(page.locator('div#app')).toHaveText(/Loading.../)

  // chain is ready
  await expect(page.locator('div#app')).toHaveText(/4000000/, { timeout: 30_000 })

  // wait for new block
  await expect(page.locator('div#app')).toHaveText(/4000001/, { timeout: 60_000 })

  process.kill()
})
