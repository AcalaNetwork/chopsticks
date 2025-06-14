import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
	plugins: [tsconfigPaths(), react()],
	base: '/chopsticks/',
	build: {
		outDir: '../../dist',
	},
	resolve: {
		alias: {
			// ensure "import 'crypto'" uses Node.js built-in
			crypto: 'node:crypto',
		},
	},
	optimizeDeps: {
		exclude: ['crypto-browserify'],
	},
})
