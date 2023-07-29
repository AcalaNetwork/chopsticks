import { ChildProcessWithoutNullStreams, spawn } from 'node:child_process'
import { expect, test } from '@playwright/test'

const startServer = async (): Promise<ChildProcessWithoutNullStreams> => {
  console.log('Starting server...')
  return new Promise((resolve, reject) => {
    const server = spawn('yarn', ['start'])
    server.stderr.on('data', () => {
      reject()
    })
    server.stdout.on('data', (data) => {
      if (data.toString().includes(`http://127.0.0.1`)) {
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
  await expect(page.locator('div')).toHaveText(/Loading.../)

  // chain is ready
  await expect(page.locator('div')).toHaveText(/4000000.../)

  // wait for new block
  await expect(page.locator('div')).toHaveText(/4000001.../, { timeout: 60_000 })

  process.kill()
})
