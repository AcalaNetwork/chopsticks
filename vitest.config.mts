import { defineConfig } from 'vitest/config'
import swc from 'unplugin-swc'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
	test: {
		minThreads: process.env.CI ? 1 : undefined /* use defaults */,
		maxThreads: process.env.CI ? 4 : undefined /* use defaults */,
		hookTimeout: 30000,
		testTimeout: 120000,
		include: ['packages/**/*.test.ts'],
		bail: process.env.CI ? 0 : undefined /* use defaults */,
	},
	plugins: [swc.vite(), tsconfigPaths()],
})
