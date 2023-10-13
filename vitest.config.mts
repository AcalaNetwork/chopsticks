import { defineConfig } from 'vitest/config'
import swc from 'unplugin-swc'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
	test: {
		hookTimeout: 30000,
		testTimeout: 120000,
		include: ['packages/**/*.test.ts'],
	},
	plugins: [swc.vite(), tsconfigPaths()],
})
