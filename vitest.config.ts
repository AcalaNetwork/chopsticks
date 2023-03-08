import { defineConfig } from 'vitest/config'
import swc from 'unplugin-swc'

export default defineConfig({
  test: {
    hookTimeout: 30000,
    testTimeout: 120000,
  },
  plugins: [swc.vite()],
})
