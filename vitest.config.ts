import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    hookTimeout: 30000,
    testTimeout: 120000,
  },
  resolve: {
    alias: {
      '@chopsticks': resolve(__dirname, 'src'),
      '@chopsticks/*': resolve(__dirname, 'src/*'),
    },
  },
})
