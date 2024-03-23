import { defineConfig } from 'vitest/config'
import swc from 'unplugin-swc'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
	test: {
		hookTimeout: 30_000,
		testTimeout: 120_000,
		include: ['packages/**/*.test.ts'],
		bail: process.env.CI ? 1 : undefined /* use defaults */,
		pool: 'forks',
		coverage: {
			include: ['packages/chopsticks/**/*.ts', 'packages/core/**/*.ts'],
			reporter: ['text', 'json-summary', 'json', 'html'],
		},
		reporters: process.env.GITHUB_ACTIONS ? ['basic', 'github-actions'] : ['verbose', 'hanging-process'],
	},
	plugins: [swc.vite(), tsconfigPaths()],
})
